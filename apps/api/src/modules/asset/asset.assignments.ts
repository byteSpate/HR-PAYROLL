import type { AssignBody, ReturnBody } from '@erp/contracts/asset';
import { writeAudit } from '@erp/audit';
import { prisma, type AssetCondition, type Tx } from '@erp/db';
import { emit } from '@erp/events';
import { AppError } from '@erp/utils';
import type { Viewer } from '../employee/employee.access.js';
import { manageableAssets } from './asset.access.js';
import { assertManageable } from './asset.service.js';
import { lockAsset } from './asset.lock.js';
import { createRecoveryIn } from './asset.recoveries.js';
import { assignmentView, assignmentWithView } from './asset.view.js';

// The custody ledger is append-only: a row is written once and later closed by setting the return fields.
// Nothing else about it is updated and nothing is deleted. A "current holder" column would be smaller and wrong
// for the same reason: it is overwritten on every handover, and the dispute that matters is always about the
// previous holder ("I gave it back", "that dent was already there").
//
// The 409s here fire before the database's partial unique index does. The index is the real guarantee; these
// just turn a constraint violation into a message naming who is holding the thing.

export interface AssignInput {
  employeeId: string;
  conditionOut: AssetCondition;
  issueNote?: string | undefined;
  /** Set when this handover fulfils a request; carried into the event. */
  requestId?: string | null;
}

/** Hands the asset over inside the caller's transaction, which is how fulfilling a request stays atomic. */
export async function assignAssetIn(
  tx: Tx,
  assetId: string,
  input: AssignInput,
  actorUserId: string,
) {
  const asset = await lockAsset(tx, assetId);
  if (asset.lifecycle === 'RETIRED') throw new AppError(409, 'This asset is retired');
  if (asset.lifecycle === 'LOST') throw new AppError(409, 'This asset has been marked lost');

  const holder = await tx.employee.findUnique({
    where: { id: input.employeeId },
    select: { id: true, employmentStatus: true },
  });
  if (!holder) throw new AppError(400, 'Employee not found');
  if (holder.employmentStatus !== 'ACTIVE')
    throw new AppError(409, 'Only an active employee can be given an asset');

  const open = await tx.assetAssignment.findFirst({
    where: { assetId, returnedAt: null },
    include: { employee: { select: { fullName: true } } },
  });
  if (open)
    throw new AppError(409, `${asset.assetTag} is already assigned to ${open.employee.fullName}`);

  const assignment = await tx.assetAssignment.create({
    data: {
      assetId,
      employeeId: input.employeeId,
      assignedAt: new Date(),
      assignedBy: actorUserId,
      conditionOut: input.conditionOut,
      issueNote: input.issueNote ?? null,
      acknowledgedAt: null,
    },
  });
  await writeAudit(tx, {
    entity: 'ASSET_ASSIGNMENT',
    entityId: assignment.id,
    action: 'ASSIGN',
    changedBy: actorUserId,
    after: { assetId, employeeId: input.employeeId, conditionOut: input.conditionOut },
  });
  await emit(tx, 'asset.assigned', {
    assetId,
    assetTag: asset.assetTag,
    assetName: asset.name,
    employeeId: input.employeeId,
    requestId: input.requestId ?? null,
    actorUserId,
  });
  return assignment;
}

export async function assignAsset(viewer: Viewer, assetId: string, body: AssignBody) {
  await assertManageable(viewer, assetId);
  return prisma.$transaction(async (tx) =>
    assignmentView(await assignAssetIn(tx, assetId, body, viewer.sub)),
  );
}

export async function returnAsset(viewer: Viewer, assetId: string, body: ReturnBody) {
  await assertManageable(viewer, assetId);
  return prisma.$transaction(async (tx) => {
    const asset = await lockAsset(tx, assetId);
    const open = await tx.assetAssignment.findFirst({ where: { assetId, returnedAt: null } });
    if (!open) throw new AppError(409, 'Nobody is currently holding this asset');

    const updated = await tx.assetAssignment.update({
      where: { id: open.id },
      data: {
        returnedAt: new Date(),
        returnedTo: viewer.sub,
        conditionIn: body.conditionIn,
        returnNote: body.returnNote ?? null,
      },
    });

    // A return request is fulfilled by the act of receiving, not by approving it. Most returns have no request
    // behind them, because taking things back directly is routine, so this reads the ones there are.
    const closing = await tx.assetRequest.findMany({
      where: { assetId, kind: 'RETURN', status: 'APPROVED' },
      select: { id: true },
    });
    if (closing.length > 0) {
      await tx.assetRequest.updateMany({
        where: { id: { in: closing.map((r) => r.id) } },
        data: { status: 'FULFILLED', fulfilledAt: new Date(), fulfilledBy: viewer.sub },
      });
      for (const r of closing)
        await writeAudit(tx, {
          entity: 'ASSET_REQUEST',
          entityId: r.id,
          action: 'FULFIL',
          changedBy: viewer.sub,
          after: { status: 'FULFILLED' },
        });
    }

    // The other moment the facts are fresh: a damaged return offers to price the damage in the same dialog.
    if (body.recovery && body.conditionIn === 'DAMAGED') {
      await createRecoveryIn(
        tx,
        {
          assetId,
          employeeId: open.employeeId,
          assignmentId: open.id,
          amount: body.recovery.amount,
          currency: body.recovery.currency,
          reason: body.recovery.reason,
          kind: body.recovery.kind ?? 'DAMAGED',
        },
        viewer.sub,
      );
    }
    await writeAudit(tx, {
      entity: 'ASSET_ASSIGNMENT',
      entityId: open.id,
      action: 'RETURN',
      changedBy: viewer.sub,
      after: { conditionIn: body.conditionIn },
    });
    await emit(tx, 'asset.returned', {
      assetId,
      assetTag: asset.assetTag,
      employeeId: open.employeeId,
      conditionIn: body.conditionIn,
      actorUserId: viewer.sub,
    });
    return assignmentView(updated);
  });
}

export async function acknowledgeAssignment(viewer: Viewer, assignmentId: string) {
  const self = await prisma.employee.findUnique({
    where: { userId: viewer.sub },
    select: { id: true },
  });
  return prisma.$transaction(async (tx) => {
    const assignment = await tx.assetAssignment.findUnique({
      where: { id: assignmentId },
      include: { asset: true },
    });
    // Somebody else's assignment is a 404, like every other record outside your reach.
    if (!assignment || !self || assignment.employeeId !== self.id)
      throw new AppError(404, 'Assignment not found');
    // Idempotent: a second press is not an error, it returns the row unchanged.
    if (assignment.acknowledgedAt) return assignmentView(assignment);

    const updated = await tx.assetAssignment.update({
      where: { id: assignmentId },
      data: { acknowledgedAt: new Date() },
    });
    await writeAudit(tx, {
      entity: 'ASSET_ASSIGNMENT',
      entityId: assignmentId,
      action: 'ACKNOWLEDGE',
      changedBy: viewer.sub,
      after: { acknowledgedAt: updated.acknowledgedAt!.toISOString() },
    });
    await emit(tx, 'asset.acknowledged', {
      assetId: assignment.assetId,
      assetTag: assignment.asset.assetTag,
      employeeId: assignment.employeeId,
      actorUserId: viewer.sub,
    });
    return assignmentView(updated);
  });
}

/** The caller's own open and past assignments. */
export async function myHoldings(viewer: Viewer) {
  const self = await prisma.employee.findUnique({
    where: { userId: viewer.sub },
    select: { id: true },
  });
  if (!self) return [];
  const rows = await prisma.assetAssignment.findMany({
    where: { employeeId: self.id },
    include: { asset: { include: { category: true } } },
    orderBy: { assignedAt: 'desc' },
  });
  return rows.map(assignmentWithView);
}

/** The chase list: open assignments the holder has not yet acknowledged, oldest first. */
export async function listUnacknowledged(viewer: Viewer) {
  const rows = await prisma.assetAssignment.findMany({
    where: { returnedAt: null, acknowledgedAt: null, asset: await manageableAssets(viewer) },
    include: {
      asset: { include: { category: true } },
      employee: { select: { id: true, fullName: true, employeeCode: true } },
    },
    orderBy: { assignedAt: 'asc' },
  });
  return rows.map(assignmentWithView);
}

export interface OpenAssignment {
  assignmentId: string;
  assetId: string;
  assetTag: string;
  assetName: string;
  categoryName: string;
  assignedAt: string;
  conditionOut: AssetCondition;
  acknowledgedAt: string | null;
}

/**
 * A leaver's exit checklist, read by settlement. A warning, never a blocker: an unreturned laptop does not
 * stop a settlement, because the salary figure is right and the asset is a separate debt. Consumables are
 * left out, since a mouse is issued, recorded and never chased.
 */
export async function openAssignmentsFor(
  employeeId: string,
  db: Tx | typeof prisma = prisma,
): Promise<OpenAssignment[]> {
  const rows = await db.assetAssignment.findMany({
    where: { employeeId, returnedAt: null, asset: { category: { isConsumable: false } } },
    include: { asset: { include: { category: true } } },
    orderBy: { assignedAt: 'asc' },
  });
  return rows.map((r) => ({
    assignmentId: r.id,
    assetId: r.assetId,
    assetTag: r.asset.assetTag,
    assetName: r.asset.name,
    categoryName: r.asset.category.name,
    assignedAt: r.assignedAt.toISOString(),
    conditionOut: r.conditionOut,
    acknowledgedAt: r.acknowledgedAt ? r.acknowledgedAt.toISOString() : null,
  }));
}
