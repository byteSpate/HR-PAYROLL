import { approveClaimBody, approveClaimsBody, rejectClaimBody, type BatchApproveResult, type ExpenseClaim } from '@erp/contracts/expense';
import { assertMayDecide, assertPending, decisionStamp } from '@erp/approvals';
import { writeAudit } from '@erp/audit';
import { bdtTotal, prisma, type Tx } from '@erp/db';
import { emit } from '@erp/events';
import { formatDateOnly } from '@erp/export';
import { notify } from '@erp/notifications';
import { AppError } from '@erp/utils';
import type { Viewer } from '../employee/employee.access.js';
import { scopeForViewer } from '../employee/employee.scope.js';
import { resolveRateOrThrow } from '../exchange/exchange.fx.js';
import { CLAIM_INCLUDE, claimView } from './expense.view.js';

/**
 * The claim to decide, once the viewer is known to be allowed to: they hold expense.approve, the
 * claim's owner is in reach, and they are not deciding their own unless they are an administrator.
 */
async function claimToDecide(viewer: Viewer, id: string) {
  const scope = await scopeForViewer(viewer, 'expense.approve');
  const actor = await prisma.employee.findUnique({ where: { userId: viewer.sub }, select: { id: true } });
  const claim = await prisma.expenseClaim.findUnique({ where: { id }, include: CLAIM_INCLUDE });
  if (!claim) throw new AppError(404, 'Expense claim not found');
  const reachable = await prisma.employee.count({ where: { AND: [scope, { id: claim.employeeId }] } });
  assertMayDecide({ actorEmployeeId: actor?.id ?? null, actorIsAdmin: viewer.accessLevel !== 'STANDARD', subjectEmployeeId: claim.employeeId, reaches: () => reachable > 0 });
  assertPending(claim.status);
  return { claim, selfDecided: actor?.id === claim.employeeId };
}

async function approveOne(viewer: Viewer, id: string, note?: string): Promise<ExpenseClaim> {
  const { claim, selfDecided } = await claimToDecide(viewer, id);
  // Stops with a 409 naming the currency and date when no rate covers the spend date; never defaults to 1.
  const fxRateToBdt = await resolveRateOrThrow(claim.currency, claim.expenseDate);
  const stamp = decisionStamp(viewer.sub, note);

  return prisma.$transaction(async (tx) => {
    const changed = await tx.expenseClaim.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'APPROVED', fxRateToBdt, decidedBy: stamp.decidedBy, decidedAt: stamp.decidedAt, decisionNote: stamp.decisionNote } });
    if (!changed.count) throw new AppError(409, 'This request has already been decided');
    const amount = claim.amount.toFixed(2);
    await writeAudit(tx, { entity: 'EXPENSE_CLAIM', entityId: id, action: 'APPROVE', changedBy: viewer.sub, before: { status: 'PENDING' }, after: { status: 'APPROVED', fxRateToBdt: fxRateToBdt.toFixed(6), decisionNote: stamp.decisionNote } });
    await emit(tx, 'expense.claim.approved', {
      claimId: id,
      employeeId: claim.employeeId,
      category: claim.category.name,
      amount,
      currency: claim.currency,
      fxRateToBdt: fxRateToBdt.toFixed(6),
      // Each BDT figure is a conversion of the native total, never a sum of converted parts.
      amountBdt: bdtTotal(claim.amount, fxRateToBdt).toFixed(2),
      actorUserId: viewer.sub,
      note: stamp.decisionNote,
      selfDecided,
    });
    await notify(tx, { userId: (await tx.employee.findUniqueOrThrow({ where: { id: claim.employeeId }, select: { userId: true } })).userId, type: 'expense.claim.approved', title: 'Expense claim approved', body: `${claim.category.name} on ${formatDateOnly(claim.expenseDate)}`, href: '/me/expenses', entity: 'EXPENSE_CLAIM', entityId: id });
    return claimView(await tx.expenseClaim.findUniqueOrThrow({ where: { id }, include: CLAIM_INCLUDE }));
  });
}

export function approveClaim(viewer: Viewer, id: string, input: unknown): Promise<ExpenseClaim> {
  return approveOne(viewer, id, approveClaimBody.parse(input).note);
}

export async function rejectClaim(viewer: Viewer, id: string, input: unknown): Promise<ExpenseClaim> {
  const { note } = rejectClaimBody.parse(input);
  const { claim, selfDecided } = await claimToDecide(viewer, id);
  const stamp = decisionStamp(viewer.sub, note);

  return prisma.$transaction(async (tx) => {
    const changed = await tx.expenseClaim.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'REJECTED', decidedBy: stamp.decidedBy, decidedAt: stamp.decidedAt, decisionNote: stamp.decisionNote } });
    if (!changed.count) throw new AppError(409, 'This request has already been decided');
    await writeAudit(tx, { entity: 'EXPENSE_CLAIM', entityId: id, action: 'REJECT', changedBy: viewer.sub, before: { status: 'PENDING' }, after: { status: 'REJECTED', decisionNote: stamp.decisionNote } });
    await emit(tx, 'expense.claim.rejected', { claimId: id, employeeId: claim.employeeId, category: claim.category.name, amount: claim.amount.toFixed(2), currency: claim.currency, actorUserId: viewer.sub, note: stamp.decisionNote, selfDecided });
    await notify(tx, { userId: (await tx.employee.findUniqueOrThrow({ where: { id: claim.employeeId }, select: { userId: true } })).userId, type: 'expense.claim.rejected', title: 'Expense claim rejected', body: stamp.decisionNote ?? undefined, href: '/me/expenses', entity: 'EXPENSE_CLAIM', entityId: id });
    return claimView(await tx.expenseClaim.findUniqueOrThrow({ where: { id }, include: CLAIM_INCLUDE }));
  });
}

/**
 * Approve many in one sweep. Best effort, not all or nothing: each claim is its own transaction and
 * its own failure, because one USD claim with no covering rate must not block eleven correct approvals
 * beside it. Refusals come back named. Sequential, so decisions do not contend for the same rows.
 */
export async function approveClaims(viewer: Viewer, input: unknown): Promise<BatchApproveResult> {
  const { claimIds } = approveClaimsBody.parse(input);
  const approved: string[] = [];
  const failed: BatchApproveResult['failed'] = [];
  for (const id of claimIds) {
    try {
      await approveOne(viewer, id);
      approved.push(id);
    } catch (err) {
      failed.push({ id, reason: err instanceof AppError ? err.message : 'Could not be approved' });
    }
  }
  return { approved, failed };
}

/**
 * Marks approved claims as paid by a payslip or a settlement. Never reachable from a route: REIMBURSED
 * is a fact the payroll or settlement transaction reaches, not a status a person types. Runs inside
 * the caller's transaction so the claims move with the payment, and refuses the whole set if any
 * claim is not approved.
 */
export async function reimburseClaims(tx: Tx, claimIds: string[], target: { payslipId?: string; settlementId?: string; actorUserId: string }): Promise<void> {
  const claims = await tx.expenseClaim.findMany({ where: { id: { in: claimIds } }, include: { category: { select: { name: true } } } });
  const bad = claimIds.filter((id) => claims.find((c) => c.id === id)?.status !== 'APPROVED');
  if (bad.length > 0) throw new AppError(409, `${bad.length} expense claim(s) are not approved and cannot be reimbursed`);
  for (const claim of claims) {
    const changed = await tx.expenseClaim.updateMany({ where: { id: claim.id, status: 'APPROVED' }, data: { status: 'REIMBURSED', payslipId: target.payslipId ?? null, settlementId: target.settlementId ?? null } });
    if (!changed.count) throw new AppError(409, 'An expense claim was reimbursed by someone else first');
    await writeAudit(tx, { entity: 'EXPENSE_CLAIM', entityId: claim.id, action: 'UPDATE', changedBy: target.actorUserId, before: { status: 'APPROVED' }, after: { status: 'REIMBURSED', payslipId: target.payslipId ?? null, settlementId: target.settlementId ?? null } });
    await emit(tx, 'expense.claim.reimbursed', { claimId: claim.id, employeeId: claim.employeeId, category: claim.category.name, amount: claim.amount.toFixed(2), currency: claim.currency, payslipId: target.payslipId ?? null, settlementId: target.settlementId ?? null, actorUserId: target.actorUserId });
  }
}
