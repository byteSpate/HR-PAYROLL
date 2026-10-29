import { prisma } from '@erp/db';
import { cleanActors } from '../../test-utils/access.js';

export { daysAgo, hireActor, makeDepartment } from '../../test-utils/people.js';

/** Removes what a test file made under `prefix`: claims and their trail, categories, people, departments and actors. */
/** A payslip a claim can point at. The run sits in a year no real run uses, and `cleanExpenseData` removes it. */
export async function makePayslip(employeeId: string, n = 1) {
  const run = await prisma.payrollRun.create({ data: { year: 2099, month: ((n - 1) % 12) + 1 } });
  return prisma.payslip.create({
    data: {
      payslipNo: `ZZEXP-${Date.now()}-${n}`,
      payrollRunId: run.id,
      employeeId,
      calendarDays: 30,
      lopDays: 0,
      payableDays: 30,
      currency: 'BDT',
      basic: 0,
      grossFull: 0,
      grossPay: 0,
      totalDeductions: 0,
      netPay: 0,
      netPayable: 0,
      fxRateToBdt: 1,
      grossPayBdt: 0,
      totalDeductionsBdt: 0,
      netPayBdt: 0,
      netPayableBdt: 0,
      breakdown: {},
    },
  });
}

export async function cleanExpenseData(
  prefix: string,
  departmentIds: string[],
  extraCategoryIds: string[] = [],
) {
  // By login prefix as well as department, so a run that died half way cannot leave an employee blocking the next one.
  const people = (
    await prisma.employee.findMany({
      where: {
        OR: [{ departmentId: { in: departmentIds } }, { user: { email: { startsWith: prefix } } }],
      },
      select: { id: true },
    })
  ).map((p) => p.id);
  const claimIds = (
    await prisma.expenseClaim.findMany({
      where: { employeeId: { in: people } },
      select: { id: true },
    })
  ).map((c) => c.id);
  const categoryIds = [
    ...(
      await prisma.expenseCategory.findMany({
        where: { code: { startsWith: prefix.toUpperCase() } },
        select: { id: true },
      })
    ).map((c) => c.id),
    ...extraCategoryIds,
  ];
  await prisma.outboxEvent.deleteMany({
    where: { OR: claimIds.map((id) => ({ payload: { path: ['claimId'], equals: id } })) },
  });
  await prisma.auditLog.deleteMany({
    where: {
      OR: [
        { entity: 'EXPENSE_CLAIM', entityId: { in: claimIds } },
        { entity: 'EXPENSE_CATEGORY', entityId: { in: categoryIds } },
      ],
    },
  });
  await prisma.notification.deleteMany({
    where: { entity: 'EXPENSE_CLAIM', entityId: { in: claimIds } },
  });
  await prisma.expenseAttachment.deleteMany({ where: { claimId: { in: claimIds } } });
  await prisma.expenseClaim.deleteMany({ where: { id: { in: claimIds } } });
  await prisma.payslip.deleteMany({ where: { employeeId: { in: people } } });
  await prisma.payrollRun.deleteMany({ where: { year: 2099, payslips: { none: {} } } });
  await prisma.expenseCategory.deleteMany({ where: { id: { in: categoryIds } } });
  await prisma.employee.updateMany({
    where: { id: { in: people } },
    data: { reportingManagerId: null },
  });
  await prisma.employee.deleteMany({ where: { id: { in: people } } });
  await prisma.department.deleteMany({
    where: { OR: [{ id: { in: departmentIds } }, { name: { startsWith: prefix } }] },
  });
  await cleanActors(prefix);
}
