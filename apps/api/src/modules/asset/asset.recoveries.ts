import type { CreateRecoveryBody, RecoveryQuery, UpdateRecoveryBody } from '@erp/contracts/asset';
import { writeAudit } from '@erp/audit';
import { dec, prisma, round2, type AssetRecovery, type Prisma, type Tx } from '@erp/db';
import { AppError } from '@erp/utils';
import type { Viewer } from '../employee/employee.access.js';
import { scopeForViewer } from '../employee/employee.scope.js';
import { lockRecovery } from './asset.lock.js';
import { recoveryView } from './asset.view.js';

// A recovery records that a debt exists, who priced it and why. It does nothing to money on its own:
// collecting it is a separate act in payroll or at settlement. Editable while PENDING, frozen afterwards,
// never deleted: a recovery that turns out to be a mistake is waived with a reason saying so.

const NOT_POSITIVE =
  'A recovery amount must be greater than zero. A zero-value recovery is a waiver, so waive it instead.';

/**
 * A recovery needs a custody link: the asset must have been assigned to the employee at some point, or the
 * caller names the assignment it arose under. An asset the employee never held cannot be recovered from them.
 */
async function custodyLink(
  tx: Tx,
  body: Pick<CreateRecoveryBody, 'assetId' | 'employeeId' | 'assignmentId'>,
): Promise<string> {
  if (body.assignmentId) {
    const named = await tx.assetAssignment.findFirst({
      where: { id: body.assignmentId, assetId: body.assetId, employeeId: body.employeeId },
      select: { id: true },
    });
    if (!named)
      throw new AppError(400, 'That assignment is not this employee’s holding of this asset');
    return named.id;
  }
  const assignment = await tx.assetAssignment.findFirst({
    where: { assetId: body.assetId, employeeId: body.employeeId },
    orderBy: { assignedAt: 'desc' },
    select: { id: true },
  });
  if (assignment) return assignment.id;
  const asset = await tx.asset.findUnique({
    where: { id: body.assetId },
    select: { assetTag: true },
  });
  throw new AppError(
    400,
    `${asset?.assetTag ?? 'This asset'} has no assignment history with this employee, so a recovery cannot be raised against them.`,
  );
}

/**
 * The core behind raising a recovery by hand and behind marking an asset lost or returning it damaged:
 * the loss and the pricing of it commit or roll back together, so a laptop is never marked lost with no debt recorded.
 */
export async function createRecoveryIn(
  tx: Tx,
  body: CreateRecoveryBody,
  actorUserId: string,
): Promise<AssetRecovery> {
  const amount = round2(dec(body.amount));
  if (amount.lessThanOrEqualTo(0)) throw new AppError(400, NOT_POSITIVE);
  const assignmentId = await custodyLink(tx, body);
  const kind = body.kind ?? 'NOT_RETURNED';

  const recovery = await tx.assetRecovery.create({
    data: {
      assetId: body.assetId,
      employeeId: body.employeeId,
      assignmentId,
      kind,
      amount,
      currency: body.currency ?? 'BDT',
      reason: body.reason.trim(),
      status: 'PENDING',
      createdBy: actorUserId,
    },
  });
  await writeAudit(tx, {
    entity: 'ASSET_RECOVERY',
    entityId: recovery.id,
    action: 'CREATE',
    changedBy: actorUserId,
    after: { assetId: body.assetId, employeeId: body.employeeId, amount: amount.toFixed(2), kind },
  });
  return recovery;
}

export function createRecovery(viewer: Viewer, body: CreateRecoveryBody) {
  return prisma.$transaction(async (tx) =>
    recoveryView(await createRecoveryIn(tx, body, viewer.sub)),
  );
}

export function updateRecovery(viewer: Viewer, id: string, body: UpdateRecoveryBody) {
  return prisma.$transaction(async (tx) => {
    const recovery = await lockRecovery(tx, id);
    if (recovery.status !== 'PENDING')
      throw new AppError(
        409,
        `This recovery is ${recovery.status.toLowerCase()}. A correction is a fresh recovery, not an edit.`,
      );
    const data: Prisma.AssetRecoveryUpdateInput = {};
    if (body.amount !== undefined) {
      const amount = round2(dec(body.amount));
      if (amount.lessThanOrEqualTo(0)) throw new AppError(400, NOT_POSITIVE);
      data.amount = amount;
    }
    if (body.currency !== undefined) data.currency = body.currency;
    if (body.reason !== undefined) data.reason = body.reason.trim();
    const updated = await tx.assetRecovery.update({ where: { id }, data });
    await writeAudit(tx, {
      entity: 'ASSET_RECOVERY',
      entityId: id,
      action: 'UPDATE',
      changedBy: viewer.sub,
      before: {
        amount: recovery.amount.toFixed(2),
        currency: recovery.currency,
        reason: recovery.reason,
      },
      after: {
        amount: updated.amount.toFixed(2),
        currency: updated.currency,
        reason: updated.reason,
      },
    });
    return recoveryView(updated);
  });
}

export function waiveRecovery(viewer: Viewer, id: string, body: { waiverReason: string }) {
  return prisma.$transaction(async (tx) => {
    const recovery = await lockRecovery(tx, id);
    if (recovery.status === 'WAIVED')
      throw new AppError(
        409,
        'This recovery has already been waived. A waiver has a named author and a reason, and un-waiving would erase that. Record a new recovery instead.',
      );
    if (recovery.status === 'RECOVERED')
      throw new AppError(409, 'This recovery was already collected, so it cannot be waived.');
    const updated = await tx.assetRecovery.update({
      where: { id },
      data: {
        status: 'WAIVED',
        waivedBy: viewer.sub,
        waivedAt: new Date(),
        waiverReason: body.waiverReason.trim(),
      },
    });
    await writeAudit(tx, {
      entity: 'ASSET_RECOVERY',
      entityId: id,
      action: 'WAIVE',
      changedBy: viewer.sub,
      before: { status: 'PENDING' },
      after: { status: 'WAIVED', waiverReason: body.waiverReason.trim() },
    });
    return recoveryView(updated);
  });
}

const RECOVERY_INCLUDE = {
  asset: { select: { assetTag: true, name: true, category: { select: { name: true } } } },
} as const;

/**
 * An employee sees their own recoveries and nobody else's, because a deduction someone can see coming is a
 * deduction disputed before it is paid, not after. A reader with a wider asset.read grant sees the people it reaches.
 */
export async function listRecoveries(viewer: Viewer, query: RecoveryQuery = {}) {
  const me = await prisma.employee.findUnique({
    where: { userId: viewer.sub },
    select: { id: true },
  });
  const reach = await scopeForViewer(viewer, 'asset.read').catch(() => null);
  // An empty filter means everyone, which an OR beside the viewer's own row would not preserve.
  const holders: Prisma.EmployeeWhereInput =
    reach === null
      ? { id: me?.id ?? '' }
      : me && Object.keys(reach).length > 0
        ? { OR: [{ id: me.id }, reach] }
        : reach;
  const rows = await prisma.assetRecovery.findMany({
    where: {
      employee: holders,
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.assetId ? { assetId: query.assetId } : {}),
    },
    include: RECOVERY_INCLUDE,
    orderBy: { createdAt: 'desc' },
  });
  return rows.map(recoveryView);
}

/** PENDING recoveries for one employee: the debt half of the exit checklist. */
export async function pendingRecoveriesFor(employeeId: string, db: Tx | typeof prisma = prisma) {
  const rows = await db.assetRecovery.findMany({
    where: { employeeId, status: 'PENDING' },
    include: RECOVERY_INCLUDE,
    orderBy: { createdAt: 'desc' },
  });
  return rows.map(recoveryView);
}

/**
 * The mid-employment collection path. Creating a recovery does nothing to money; turning it into a deduction is
 * this separate act. It creates a payroll adjustment and stops: the next run consumes it. The unique
 * `adjustmentId` is the idempotency guard, so a second click collides at the database, not at a check two
 * rapid clicks could race. The switch lives in payroll settings; asset only reads its table.
 */
export function recoverFromPayroll(viewer: Viewer, id: string) {
  return prisma.$transaction(async (tx) => {
    const settings = await tx.payrollSetting.findUnique({ where: { id: 'payroll' } });
    if (settings && !settings.recoverAssetsFromSalary)
      throw new AppError(
        409,
        'Taking money from salary for assets is turned off. To turn it on, go to Settings, then Payroll. If the employee does not need to pay, use Waive.',
      );
    const recovery = await lockRecovery(tx, id);
    if (recovery.status === 'WAIVED')
      throw new AppError(409, 'A waived recovery cannot be deducted from payroll.');
    if (recovery.status === 'RECOVERED')
      throw new AppError(409, 'This recovery was already collected.');
    if (recovery.adjustmentId)
      throw new AppError(409, 'This recovery is already being collected through payroll.');

    const asset = await tx.asset.findUnique({
      where: { id: recovery.assetId },
      select: { assetTag: true, name: true },
    });
    const now = new Date();
    const adjustment = await tx.payrollAdjustment.create({
      data: {
        employeeId: recovery.employeeId,
        // The current month: the next run in progress picks it up, and a closed month refuses it at process.
        month: now.getUTCMonth() + 1,
        year: now.getUTCFullYear(),
        kind: 'DEDUCTION',
        code: 'ASSET_RECOVERY',
        label: `Asset recovery - ${asset?.assetTag ?? 'asset'} ${asset?.name ?? ''}`.trim(),
        currency: recovery.currency,
        amount: recovery.amount,
        reason: recovery.reason,
        createdBy: viewer.sub,
      },
    });
    const updated = await tx.assetRecovery.update({
      where: { id },
      data: { adjustmentId: adjustment.id },
    });
    await writeAudit(tx, {
      entity: 'ASSET_RECOVERY',
      entityId: id,
      action: 'UPDATE',
      changedBy: viewer.sub,
      before: { adjustmentId: null },
      after: { adjustmentId: adjustment.id },
    });
    return recoveryView(updated);
  });
}
