import { createClaimBody, hasRoute, updateClaimBody, type ClaimQuery, type ExpenseClaim } from '@erp/contracts/expense';
import { getStorage } from '@erp/attachments';
import { writeAudit } from '@erp/audit';
import { dec, prisma } from '@erp/db';
import { emit } from '@erp/events';
import { formatDateOnly, officeToday, parseDateOnly } from '@erp/export';
import { approverUserIds, notify } from '@erp/notifications';
import { AppError } from '@erp/utils';
import type { Viewer } from '../employee/employee.access.js';
import { scopeForViewer } from '../employee/employee.scope.js';
import { lockOwnPending } from './expense.lock.js';
import { CLAIM_INCLUDE, claimView } from './expense.view.js';

/** Long enough to cover an approval delay across a month boundary, short enough that a claim cannot surface against a closed payroll month. */
export const MAX_CLAIM_AGE_DAYS = 90;

export async function employeeOf(userId: string) {
  const employee = await prisma.employee.findUnique({ where: { userId } });
  if (!employee) throw new AppError(403, 'An employee record is required');
  return employee;
}

/** The spend-date rules, shared by filing and amending so an edit cannot be a way round them. */
function assertSpendDate(date: Date): void {
  const today = officeToday();
  if (date.getTime() > today.getTime()) throw new AppError(400, 'An expense cannot be dated in the future');
  const ageDays = Math.floor((today.getTime() - date.getTime()) / 86_400_000);
  if (ageDays > MAX_CLAIM_AGE_DAYS) {
    throw new AppError(400, `This expense is ${ageDays} days old. Claims must be submitted within ${MAX_CLAIM_AGE_DAYS} days of the spend date.`);
  }
}

/** Whoever may decide on a claim may read it, so an approver needs no separate read grant to see what they are asked to approve. */
const READERS = ['expense.read', 'expense.approve'] as const;

export async function createClaim(viewer: Viewer, input: unknown): Promise<ExpenseClaim> {
  const body = createClaimBody.parse(input);
  const self = await employeeOf(viewer.sub);
  const expenseDate = parseDateOnly(body.expenseDate);
  assertSpendDate(expenseDate);

  return prisma.$transaction(async (tx) => {
    const category = await tx.expenseCategory.findUnique({ where: { id: body.categoryId } });
    if (!category) throw new AppError(400, 'Choose a valid expense category');
    // A "from" on a stationery claim is a field filled in by accident, and would print as though the journey happened.
    const route = hasRoute(category.code);
    const claim = await tx.expenseClaim.create({
      data: {
        employeeId: self.id,
        categoryId: category.id,
        name: body.name,
        description: body.description,
        amount: dec(body.amount),
        currency: body.currency,
        expenseDate,
        travelFrom: route ? body.travelFrom : null,
        travelTo: route ? body.travelTo : null,
      },
      include: CLAIM_INCLUDE,
    });
    const amount = claim.amount.toFixed(2);
    await writeAudit(tx, { entity: 'EXPENSE_CLAIM', entityId: claim.id, action: 'CREATE', changedBy: viewer.sub, after: { employeeId: self.id, amount, currency: claim.currency, expenseDate: body.expenseDate } });
    await emit(tx, 'expense.claim.submitted', { claimId: claim.id, employeeId: self.id, category: category.name, amount, currency: claim.currency, actorUserId: viewer.sub });
    const approvers = await approverUserIds(tx, self.id, 'expense.approve');
    await notify(tx, approvers.map((userId) => ({ userId, type: 'expense.claim.submitted', title: 'Expense claim needs review', href: '/expenses', entity: 'EXPENSE_CLAIM', entityId: claim.id })));
    return claimView(claim);
  });
}

export async function getMyClaims(viewer: Viewer): Promise<ExpenseClaim[]> {
  const self = await employeeOf(viewer.sub);
  const rows = await prisma.expenseClaim.findMany({ where: { employeeId: self.id }, include: CLAIM_INCLUDE, orderBy: { createdAt: 'desc' } });
  return rows.map(claimView);
}

export async function listClaims(viewer: Viewer, query: ClaimQuery): Promise<ExpenseClaim[]> {
  const employee = await scopeForViewer(viewer, READERS);
  const rows = await prisma.expenseClaim.findMany({
    where: { employee, ...(query.status ? { status: query.status } : {}), ...(query.employeeId ? { employeeId: query.employeeId } : {}) },
    include: CLAIM_INCLUDE,
    orderBy: { createdAt: 'desc' },
  });
  return rows.map(claimView);
}

/** A claim the viewer filed or reaches through expense.read. Anything else is a 404, so existence is not confirmed. */
export async function getClaim(viewer: Viewer, id: string): Promise<ExpenseClaim> {
  const row = await prisma.expenseClaim.findUnique({ where: { id }, include: CLAIM_INCLUDE });
  if (!row) throw new AppError(404, 'Expense claim not found');
  const self = await prisma.employee.findUnique({ where: { userId: viewer.sub }, select: { id: true } });
  if (row.employeeId === self?.id) return claimView(row);
  const scope = await scopeForViewer(viewer, READERS).catch(() => null);
  const reaches = scope !== null && (await prisma.employee.count({ where: { AND: [scope, { id: row.employeeId }] } })) > 0;
  if (!reaches) throw new AppError(404, 'Expense claim not found');
  return claimView(row);
}

export async function updateClaim(viewer: Viewer, id: string, input: unknown): Promise<ExpenseClaim> {
  const body = updateClaimBody.parse(input);
  const self = await employeeOf(viewer.sub);
  const newDate = body.expenseDate === undefined ? undefined : parseDateOnly(body.expenseDate);
  if (newDate) assertSpendDate(newDate);

  return prisma.$transaction(async (tx) => {
    // Under the claim's lock: an approval that lands first is seen here, and this edit is refused.
    const claim = await lockOwnPending(tx, self.id, id, 'it');
    const expenseDate = newDate ?? claim.expenseDate;
    const categoryId = body.categoryId ?? claim.categoryId;
    const category = await tx.expenseCategory.findUnique({ where: { id: categoryId } });
    if (!category) throw new AppError(400, 'Choose a valid expense category');
    // Moving a claim off a travel category takes its route with it.
    const route = hasRoute(category.code);
    const updated = await tx.expenseClaim.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.amount !== undefined ? { amount: dec(body.amount) } : {}),
        ...(body.currency !== undefined ? { currency: body.currency } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        categoryId,
        expenseDate,
        travelFrom: route ? (body.travelFrom === undefined ? claim.travelFrom : body.travelFrom) : null,
        travelTo: route ? (body.travelTo === undefined ? claim.travelTo : body.travelTo) : null,
      },
      include: CLAIM_INCLUDE,
    });
    const facts = (c: { name: string; amount: { toFixed(n: number): string }; currency: string; categoryId: string; expenseDate: Date }) => ({ name: c.name, amount: c.amount.toFixed(2), currency: c.currency, categoryId: c.categoryId, expenseDate: formatDateOnly(c.expenseDate) });
    await writeAudit(tx, { entity: 'EXPENSE_CLAIM', entityId: id, action: 'UPDATE', changedBy: viewer.sub, before: facts(claim), after: facts(updated) });
    return claimView(updated);
  });
}

/** A hard delete: a pending claim nobody has acted on has no history worth a fifth status, and the audit row records that it existed. */
export async function deleteClaim(viewer: Viewer, id: string): Promise<void> {
  const self = await employeeOf(viewer.sub);
  const receipts = await prisma.$transaction(async (tx) => {
    const claim = await lockOwnPending(tx, self.id, id, 'it');
    const files = await tx.expenseAttachment.findMany({ where: { claimId: id }, select: { publicId: true } });
    await writeAudit(tx, { entity: 'EXPENSE_CLAIM', entityId: id, action: 'DELETE', changedBy: viewer.sub, before: { name: claim.name, amount: claim.amount.toFixed(2), currency: claim.currency, expenseDate: formatDateOnly(claim.expenseDate) } });
    await tx.expenseClaim.delete({ where: { id } });
    return files;
  });
  // The attachment rows cascaded with the claim; their files go once the delete has committed. A claim
  // that lost a race to an approval must keep its evidence, so nothing is removed before that is known.
  // A file that cannot be removed is left behind unreferenced, which costs storage and never a record.
  await Promise.allSettled(receipts.map((receipt) => getStorage()?.remove(receipt.publicId)));
}
