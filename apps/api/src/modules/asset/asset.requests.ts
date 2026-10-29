import type { SubmitRequestBody } from '@erp/contracts/asset';
import { assertMayDecide, assertPending } from '@erp/approvals';
import { writeAudit } from '@erp/audit';
import { prisma, type Prisma, type Tx } from '@erp/db';
import { emit } from '@erp/events';
import { parseDateOnly } from '@erp/export';
import { approverUserIds, notify } from '@erp/notifications';
import { AppError } from '@erp/utils';
import type { Viewer } from '../employee/employee.access.js';
import { employeeOf } from '../employee/employee.self.js';
import { scopeForViewer } from '../employee/employee.scope.js';
import { assignAssetIn } from './asset.assignments.js';
import { lockRequest } from './asset.lock.js';
import { assertManageable } from './asset.service.js';
import { requestView } from './asset.view.js';

// A request for a new item names a category ("a monitor"), not a unit. A request to repair or return names the
// asset the requester holds. Who decides is a grant (`asset.approve`) rather than a single named role.

const LIVE = ['PENDING', 'APPROVED', 'ORDERED'] as const;

const LIST_INCLUDE = {
  category: true,
  employee: { select: { id: true, fullName: true, employeeCode: true } },
  repair: { select: { returnedAt: true } },
} satisfies Prisma.AssetRequestInclude;

/** What the requester asked for, named the way the request page names it. */
const subjectOf = (request: {
  category?: { name: string } | null;
  asset?: { assetTag: string; name: string } | null;
}) => request.category?.name ?? `${request.asset!.assetTag} · ${request.asset!.name}`;

export async function submitRequest(viewer: Viewer, body: SubmitRequestBody) {
  const self = await employeeOf(viewer.sub);
  return prisma.$transaction(async (tx) => {
    let data: Prisma.AssetRequestUncheckedCreateInput;
    let subject: string;

    if (body.kind === 'NEW_ITEM') {
      const category = await tx.assetCategory.findUnique({ where: { id: body.categoryId } });
      if (!category) throw new AppError(400, 'Asset category not found');
      // Quantity belongs to supplies alone, in both directions.
      if (!category.tracksIndividually && body.quantity === undefined)
        throw new AppError(
          400,
          `${category.name} is issued by quantity, so a quantity is required.`,
        );
      if (category.tracksIndividually && body.quantity !== undefined)
        throw new AppError(
          400,
          `${category.name} is issued one at a time, so submit one request per item.`,
        );
      data = {
        employeeId: self.id,
        kind: 'NEW_ITEM',
        categoryId: category.id,
        assetId: null,
        quantity: body.quantity ?? null,
        reason: body.reason,
        status: 'PENDING',
      };
      subject = category.name;
    } else {
      // You may only ask about a thing you are holding. A 404 rather than a 403, so an id outside your custody
      // teaches nothing about what exists.
      const held = await tx.assetAssignment.findFirst({
        where: { assetId: body.assetId, employeeId: self.id, returnedAt: null },
        include: { asset: { select: { assetTag: true, name: true } } },
      });
      if (!held) throw new AppError(404, 'Asset not found');
      // The unique partial index is the last line of defence; this turns the conflict into a sentence.
      if (
        await tx.assetRequest.findFirst({
          where: { assetId: body.assetId, kind: body.kind, status: { in: [...LIVE] } },
          select: { id: true },
        })
      )
        throw new AppError(409, 'This asset already has an open request');
      data = {
        employeeId: self.id,
        kind: body.kind,
        categoryId: null,
        assetId: body.assetId,
        quantity: null,
        reason: body.reason,
        status: 'PENDING',
      };
      subject = `${held.asset.assetTag} · ${held.asset.name}`;
    }

    const request = await tx.assetRequest.create({ data });
    await writeAudit(tx, {
      entity: 'ASSET_REQUEST',
      entityId: request.id,
      action: 'SUBMIT',
      changedBy: viewer.sub,
      after: { kind: body.kind, reason: body.reason },
    });
    await emit(tx, 'asset.request.submitted', {
      requestId: request.id,
      employeeId: self.id,
      kind: body.kind,
      subject,
      actorUserId: viewer.sub,
    });
    const approvers = await approverUserIds(tx, self.id, 'asset.approve');
    await notify(
      tx,
      approvers.map((userId) => ({
        userId,
        type: 'asset.request.submitted',
        title: 'Asset request needs review',
        body: subject,
        href: '/assets',
        entity: 'ASSET_REQUEST',
        entityId: request.id,
      })),
    );
    return requestView(request);
  });
}

/**
 * Whose requests the viewer may see: their own, plus those of the people their approve or manage grants reach.
 * No grant at all leaves just their own.
 */
async function visibleRequests(viewer: Viewer): Promise<Prisma.AssetRequestWhereInput> {
  const self = await prisma.employee.findUnique({
    where: { userId: viewer.sub },
    select: { id: true },
  });
  const reach = await scopeForViewer(viewer, ['asset.approve', 'asset.manage']).catch(() => null);
  // An empty filter means everyone, which an OR beside the viewer's own row would not preserve.
  if (reach && Object.keys(reach).length === 0) return {};
  const clauses: Prisma.EmployeeWhereInput[] = [];
  if (self) clauses.push({ id: self.id });
  if (reach) clauses.push(reach);
  return { employee: clauses.length > 0 ? { OR: clauses } : { id: '' } };
}

export async function listRequests(viewer: Viewer) {
  const rows = await prisma.assetRequest.findMany({
    where: await visibleRequests(viewer),
    include: { ...LIST_INCLUDE, asset: { select: { id: true, assetTag: true, name: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map((row) => requestView(row));
}

/** The request to decide: the viewer must reach its owner through `asset.approve`, and may not decide their own unless an administrator. */
async function requestToDecide(tx: Tx, viewer: Viewer, id: string) {
  const scope = await scopeForViewer(viewer, 'asset.approve');
  const actor = await tx.employee.findUnique({
    where: { userId: viewer.sub },
    select: { id: true },
  });
  const request = await lockRequest(tx, id);
  const reachable = await tx.employee.count({
    where: { AND: [scope, { id: request.employeeId }] },
  });
  assertMayDecide({
    actorEmployeeId: actor?.id ?? null,
    actorIsAdmin: viewer.accessLevel !== 'STANDARD',
    subjectEmployeeId: request.employeeId,
    reaches: () => reachable > 0,
  });
  assertPending(request.status);
  return request;
}

export async function approveRequest(
  viewer: Viewer,
  id: string,
  body: { note?: string | undefined },
) {
  return prisma.$transaction(async (tx) => {
    const request = await requestToDecide(tx, viewer, id);

    // Approving a repair is the act of sending it. The fault the employee typed becomes the repair's fault, so the story is not retold.
    let repairId: string | null = null;
    if (request.kind === 'REPAIR') {
      if (
        await tx.assetRepair.findFirst({
          where: { assetId: request.assetId!, returnedAt: null },
          select: { id: true },
        })
      )
        throw new AppError(409, 'This asset already has an open repair');
      repairId = (
        await tx.assetRepair.create({
          data: {
            assetId: request.assetId!,
            sentAt: new Date(),
            sentBy: viewer.sub,
            fault: request.reason,
          },
        })
      ).id;
    }
    const updated = await tx.assetRequest.update({
      where: { id },
      data: {
        status: 'APPROVED',
        decidedBy: viewer.sub,
        decidedAt: new Date(),
        decisionNote: body.note ?? null,
        ...(repairId ? { repairId } : {}),
      },
      include: LIST_INCLUDE,
    });
    await writeAudit(tx, {
      entity: 'ASSET_REQUEST',
      entityId: id,
      action: 'APPROVE',
      changedBy: viewer.sub,
      after: { status: 'APPROVED' },
      note: body.note ?? null,
    });
    await emit(tx, 'asset.request.approved', {
      requestId: id,
      employeeId: request.employeeId,
      subject: subjectOf(request),
      actorUserId: viewer.sub,
      note: body.note ?? null,
    });
    await notify(tx, {
      userId: request.employee.userId,
      type: 'asset.request.approved',
      title: 'Asset request approved',
      body: subjectOf(request),
      href: '/me/assets',
      entity: 'ASSET_REQUEST',
      entityId: id,
    });
    return requestView(updated);
  });
}

export async function rejectRequest(viewer: Viewer, id: string, body: { note: string }) {
  return prisma.$transaction(async (tx) => {
    const request = await requestToDecide(tx, viewer, id);
    const updated = await tx.assetRequest.update({
      where: { id },
      data: {
        status: 'REJECTED',
        decidedBy: viewer.sub,
        decidedAt: new Date(),
        decisionNote: body.note,
      },
      include: LIST_INCLUDE,
    });
    await writeAudit(tx, {
      entity: 'ASSET_REQUEST',
      entityId: id,
      action: 'REJECT',
      changedBy: viewer.sub,
      after: { status: 'REJECTED' },
      note: body.note,
    });
    await emit(tx, 'asset.request.rejected', {
      requestId: id,
      employeeId: request.employeeId,
      subject: subjectOf(request),
      actorUserId: viewer.sub,
      note: body.note,
    });
    await notify(tx, {
      userId: request.employee.userId,
      type: 'asset.request.rejected',
      title: 'Asset request rejected',
      body: body.note,
      href: '/me/assets',
      entity: 'ASSET_REQUEST',
      entityId: id,
    });
    return requestView(updated);
  });
}

/**
 * The requester's own while PENDING, or a live request someone who manages assets cannot source. The second
 * needs a reason: "discontinued, could not source it" is a different fact from "she changed her mind", and the
 * note is what carries the difference. No event: there is no "cancelled" stage in a feed.
 */
export async function cancelRequest(
  viewer: Viewer,
  id: string,
  body: { note?: string | undefined },
) {
  return prisma.$transaction(async (tx) => {
    const request = await lockRequest(tx, id);
    const self = await tx.employee.findUnique({
      where: { userId: viewer.sub },
      select: { id: true },
    });

    if (self?.id === request.employeeId) {
      if (request.status !== 'PENDING')
        throw new AppError(409, 'Only a pending request can be cancelled');
    } else {
      const reach = await scopeForViewer(viewer, 'asset.manage').catch(() => null);
      const reaches =
        reach !== null &&
        (await tx.employee.count({ where: { AND: [reach, { id: request.employeeId }] } })) > 0;
      if (!reaches) throw new AppError(403, 'You can only cancel your own request');
      if (!body.note?.trim())
        throw new AppError(400, 'A reason is required to cancel someone else’s request');
      if (!(LIVE as readonly string[]).includes(request.status))
        throw new AppError(409, 'This request has already been closed');
    }

    const note = body.note?.trim() || null;
    const updated = await tx.assetRequest.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        decidedBy: viewer.sub,
        decidedAt: new Date(),
        decisionNote: note,
      },
      include: LIST_INCLUDE,
    });
    await writeAudit(tx, {
      entity: 'ASSET_REQUEST',
      entityId: id,
      action: 'CANCEL',
      changedBy: viewer.sub,
      after: { status: 'CANCELLED' },
      note,
    });
    return requestView(updated);
  });
}

/** Someone who manages assets must reach the requester, or the request does not exist as far as they can tell. */
async function manageableRequest(tx: Tx, viewer: Viewer, id: string) {
  const reach = await scopeForViewer(viewer, 'asset.manage');
  const request = await lockRequest(tx, id);
  if ((await tx.employee.count({ where: { AND: [reach, { id: request.employeeId }] } })) === 0)
    throw new AppError(404, 'Asset request not found');
  return request;
}

/**
 * Someone went shopping. Deliberately carries no estimated cost: the real figure lands on the asset when it is
 * registered, and two cost fields invite a reconciliation nobody performs.
 */
export async function markOrdered(
  viewer: Viewer,
  id: string,
  body: { expectedBy?: string | undefined; note?: string | undefined },
) {
  return prisma.$transaction(async (tx) => {
    const request = await manageableRequest(tx, viewer, id);
    if (request.kind !== 'NEW_ITEM')
      throw new AppError(409, 'Only a request for a new item can be ordered');
    if (request.status !== 'APPROVED')
      throw new AppError(409, 'Only an approved request can be marked as ordered');
    const updated = await tx.assetRequest.update({
      where: { id },
      data: {
        status: 'ORDERED',
        orderedAt: new Date(),
        orderedBy: viewer.sub,
        expectedBy: body.expectedBy ? parseDateOnly(body.expectedBy) : null,
        orderNote: body.note ?? null,
      },
      include: LIST_INCLUDE,
    });
    await writeAudit(tx, {
      entity: 'ASSET_REQUEST',
      entityId: id,
      action: 'ORDER',
      changedBy: viewer.sub,
      after: { status: 'ORDERED', expectedBy: body.expectedBy ?? null },
      note: body.note ?? null,
    });
    await emit(tx, 'asset.request.ordered', {
      requestId: id,
      employeeId: request.employeeId,
      subject: subjectOf(request),
      actorUserId: viewer.sub,
      note: body.note ?? null,
    });
    return requestView(updated);
  });
}

export async function fulfilRequest(
  viewer: Viewer,
  id: string,
  body: { assetId?: string | undefined; note?: string | undefined },
) {
  if (body.assetId) await assertManageable(viewer, body.assetId);
  return prisma.$transaction(async (tx) => {
    const request = await manageableRequest(tx, viewer, id);
    // Fulfilment is an action, not a second approval. If there is no spare monitor the request stays APPROVED and
    // visibly unfulfilled, which is the honest state and a useful procurement signal. ORDERED records that
    // someone went shopping, not a promise about which unit arrives, so a spare turning up needs no resubmission.
    if (request.status !== 'APPROVED' && request.status !== 'ORDERED')
      throw new AppError(409, 'Only an approved or ordered request can be fulfilled');
    // A repair or return is completed by receiving the asset back, which the receiving flows already do.
    if (request.kind !== 'NEW_ITEM')
      throw new AppError(409, 'Only a request for a new item can be fulfilled');

    const isSupply = request.category?.tracksIndividually === false;
    if (!isSupply) {
      if (!body.assetId) throw new AppError(400, 'Choose which asset to hand over.');
      // The same transaction: a fulfilled request with no assignment behind it would be a register saying somebody has a monitor nobody issued.
      await assignAssetIn(
        tx,
        body.assetId,
        { employeeId: request.employeeId, conditionOut: 'GOOD', requestId: id },
        viewer.sub,
      );
    }
    const updated = await tx.assetRequest.update({
      where: { id },
      data: {
        status: 'FULFILLED',
        fulfilledAt: new Date(),
        fulfilledBy: viewer.sub,
        fulfilledAssetId: isSupply ? null : body.assetId!,
        fulfilledNote: body.note ?? null,
      },
      include: LIST_INCLUDE,
    });
    await writeAudit(tx, {
      entity: 'ASSET_REQUEST',
      entityId: id,
      action: 'FULFIL',
      changedBy: viewer.sub,
      after: isSupply
        ? { status: 'FULFILLED', fulfilledAssetId: null }
        : { status: 'FULFILLED', fulfilledAssetId: body.assetId! },
    });
    // No event here: assigning already emitted asset.assigned carrying the request id, and a second would put one fact in the feed twice.
    return requestView(updated);
  });
}

export interface TimelineEntry {
  action: string;
  at: string;
  byUserId: string | null;
  note: string | null;
}

/**
 * The story of one request, read back from the audit rows every transition already wrote inside its own
 * transaction. Deliberately not a second table: a status history would record the same facts twice and drift
 * from the first copy the moment one write path forgets it.
 */
export async function getRequestTimeline(viewer: Viewer, id: string): Promise<TimelineEntry[]> {
  // Through the same scope as the list, so an out-of-scope id is a 404 rather than a leaked history.
  if (
    (await prisma.assetRequest.count({
      where: { AND: [{ id }, await visibleRequests(viewer)] },
    })) === 0
  )
    throw new AppError(404, 'Asset request not found');
  const rows = await prisma.auditLog.findMany({
    where: { entity: 'ASSET_REQUEST', entityId: id },
    orderBy: { changedAt: 'asc' },
    select: { action: true, changedAt: true, changedBy: true, note: true },
  });
  return rows.map((r) => ({
    action: r.action,
    at: r.changedAt.toISOString(),
    byUserId: r.changedBy,
    note: r.note,
  }));
}
