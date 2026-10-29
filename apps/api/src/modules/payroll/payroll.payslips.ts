import { can } from '@erp/auth';
import { prisma, type Prisma } from '@erp/db';
import { AppError } from '@erp/utils';
import type { Viewer } from '../employee/employee.access.js';
import { scopeForViewer } from '../employee/employee.scope.js';

export const PAYSLIP_INCLUDE = {
  employee: { select: { id: true, fullName: true, employeeCode: true } },
  payrollRun: { select: { id: true, month: true, year: true, status: true } },
} as const;

const PUBLISHED = {
  payrollRun: { status: { in: ['APPROVED', 'DISBURSED'] } },
} satisfies Prisma.PayslipWhereInput;
const NEWEST_FIRST = [{ payrollRun: { year: 'desc' } }, { payrollRun: { month: 'desc' } }] as const;

const ownEmployeeId = async (viewer: Viewer): Promise<string | null> =>
  (await prisma.employee.findUnique({ where: { userId: viewer.sub }, select: { id: true } }))?.id ??
  null;

/**
 * Which payslips a viewer may read: their own once the run is approved or disbursed (a draft figure that then
 * changes is a conversation nobody wants), and any in the run's reach for a holder of `payroll.read`.
 * `employee.read` alone never reveals pay, and neither does being someone's manager.
 */
export async function readablePayslips(viewer: Viewer): Promise<Prisma.PayslipWhereInput> {
  const clauses: Prisma.PayslipWhereInput[] = [];
  const self = await ownEmployeeId(viewer);
  if (self) clauses.push({ employeeId: self, ...PUBLISHED });
  if (can(viewer, 'payroll.read'))
    clauses.push({ employee: await scopeForViewer(viewer, 'payroll.read') });
  return clauses.length > 0 ? { OR: clauses } : { id: { in: [] } };
}

export async function getMyPayslips(viewer: Viewer) {
  const self = await ownEmployeeId(viewer);
  if (!self) return [];
  return prisma.payslip.findMany({
    where: { employeeId: self, ...PUBLISHED },
    include: PAYSLIP_INCLUDE,
    orderBy: [...NEWEST_FIRST],
  });
}

/** Out of reach is an empty answer's cousin, a 404: probing ids or employee ids confirms nothing. */
export async function getEmployeePayslips(viewer: Viewer, employeeId: string) {
  const rows = await prisma.payslip.findMany({
    where: { AND: [{ employeeId }, await readablePayslips(viewer)] },
    include: PAYSLIP_INCLUDE,
    orderBy: [...NEWEST_FIRST],
  });
  if (
    rows.length === 0 &&
    (await ownEmployeeId(viewer)) !== employeeId &&
    !(
      can(viewer, 'payroll.read') &&
      (await prisma.employee.count({
        where: { AND: [{ id: employeeId }, await scopeForViewer(viewer, 'payroll.read')] },
      })) > 0
    )
  ) {
    throw new AppError(404, 'Employee not found');
  }
  return rows;
}

export async function getPayslip(viewer: Viewer, id: string) {
  const payslip = await prisma.payslip.findFirst({
    where: { AND: [{ id }, await readablePayslips(viewer)] },
    include: PAYSLIP_INCLUDE,
  });
  if (!payslip) throw new AppError(404, 'Payslip not found');
  return payslip;
}
