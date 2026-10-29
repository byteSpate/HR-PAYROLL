import type { AdjustmentBody, AdjustmentQuery } from '@erp/contracts/payroll';
import { writeAudit } from '@erp/audit';
import { dec, prisma, toMoneyString } from '@erp/db';
import { AppError } from '@erp/utils';
import { assertMonthNotLocked } from '../../lib/month-lock.js';
import type { Viewer } from '../employee/employee.access.js';
import { scopeForViewer } from '../employee/employee.scope.js';

const EMPLOYEE_REF = { select: { id: true, fullName: true, employeeCode: true } } as const;

/** The adjustments of the people `payroll.read` reaches. */
export async function listAdjustments(viewer: Viewer, query: AdjustmentQuery) {
  return prisma.payrollAdjustment.findMany({
    where: {
      month: query.month,
      year: query.year,
      employeeId: query.employeeId,
      employee: await scopeForViewer(viewer, 'payroll.read'),
    },
    include: { employee: EMPLOYEE_REF },
    orderBy: [{ year: 'desc' }, { month: 'desc' }, { createdAt: 'desc' }],
  });
}

/** Out of reach is a 404, so probing ids teaches nothing about who exists. */
async function reachableEmployee(viewer: Viewer, employeeId: string) {
  const employee = await prisma.employee.findFirst({
    where: { AND: [{ id: employeeId }, await scopeForViewer(viewer, 'payroll.manage')] },
    select: { id: true },
  });
  if (!employee) throw new AppError(404, 'Employee not found');
}

export async function createAdjustment(viewer: Viewer, body: AdjustmentBody) {
  await reachableEmployee(viewer, body.employeeId);
  return prisma.$transaction(async (tx) => {
    // An adjustment changes what a month should pay, so it is illegal once that month's payroll is approved or disbursed.
    await assertMonthNotLocked(new Date(Date.UTC(body.year, body.month - 1, 1)), tx);
    const adjustment = await tx.payrollAdjustment.create({
      data: {
        employeeId: body.employeeId,
        month: body.month,
        year: body.year,
        kind: body.kind,
        code: body.code,
        label: body.label,
        currency: body.currency,
        amount: dec(body.amount),
        reason: body.reason,
        createdBy: viewer.sub,
      },
    });
    await writeAudit(tx, {
      entity: 'PAYROLL_ADJUSTMENT',
      entityId: adjustment.id,
      action: 'CREATE',
      changedBy: viewer.sub,
      after: {
        employeeId: adjustment.employeeId,
        month: adjustment.month,
        year: adjustment.year,
        kind: adjustment.kind,
        code: adjustment.code,
        currency: adjustment.currency,
        amount: toMoneyString(adjustment.amount),
      },
      note: adjustment.reason,
    });
    return adjustment;
  });
}

export async function deleteAdjustment(viewer: Viewer, id: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "PayrollAdjustment" WHERE id = ${id} FOR UPDATE`;
    const existing = await tx.payrollAdjustment.findUnique({ where: { id } });
    if (!existing) throw new AppError(404, 'Adjustment not found');
    await reachableEmployee(viewer, existing.employeeId);
    // Reprocess the run to release it first, rather than silently orphaning a line that has already been paid.
    if (existing.payslipId) {
      throw new AppError(
        409,
        'This adjustment has already been paid on a payslip. Reprocess the run to release it before deleting.',
      );
    }
    await assertMonthNotLocked(new Date(Date.UTC(existing.year, existing.month - 1, 1)), tx);
    // A recovery points at its adjustment; deleting one would leave the recovery claiming a deduction that no longer exists.
    await tx.assetRecovery.updateMany({
      where: { adjustmentId: id },
      data: { adjustmentId: null },
    });
    await tx.payrollAdjustment.delete({ where: { id } });
    await writeAudit(tx, {
      entity: 'PAYROLL_ADJUSTMENT',
      entityId: id,
      action: 'DELETE',
      changedBy: viewer.sub,
      before: {
        employeeId: existing.employeeId,
        month: existing.month,
        year: existing.year,
        code: existing.code,
        amount: toMoneyString(existing.amount),
      },
    });
    return { id };
  });
}
