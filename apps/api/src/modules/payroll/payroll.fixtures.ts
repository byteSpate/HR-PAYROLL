import request from 'supertest';
import type { Express } from 'express';
import { prisma } from '@erp/db';
import { cleanActors } from '../../test-utils/access.js';
import { cleanExpenseData } from '../expense/expense.fixtures.js';

export { daysAgo, hireActor, makeDepartment } from '../../test-utils/people.js';

/** A salary structure made through the API, as an administrator would. `basic` and components follow the original's seed. */
export async function makeStructure(
  app: Express,
  header: Record<string, string>,
  prefix: string,
  over: Record<string, unknown> = {},
) {
  const res = await request(app)
    .post('/api/payroll/salary-structures')
    .set(header)
    .send({
      name: `${prefix} structure ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      currency: 'BDT',
      basic: '50000',
      components: [
        {
          code: 'HOUSE_RENT',
          label: 'House rent',
          kind: 'EARNING',
          calc: 'PERCENT_OF_BASIC',
          value: '50',
        },
        { code: 'MEDICAL', label: 'Medical', kind: 'EARNING', calc: 'FIXED', value: '3000' },
        { code: 'CONVEYANCE', label: 'Conveyance', kind: 'EARNING', calc: 'FIXED', value: '2000' },
        {
          code: 'PF',
          label: 'Provident fund',
          kind: 'DEDUCTION',
          calc: 'PERCENT_OF_BASIC',
          value: '10',
        },
        { code: 'TAX', label: 'Income tax', kind: 'DEDUCTION', calc: 'FIXED', value: '2500' },
      ],
      ...over,
    });
  if (res.status !== 201) throw new Error(`structure: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body as { id: string; name: string };
}

/**
 * Removes what a payroll test made, children first. `years` are the run years the file owns: they are far in
 * the future so a file's runs are told apart from anything else in the database.
 */
export async function cleanPayrollData(prefix: string, departmentIds: string[], years: number[]) {
  const people = (
    await prisma.employee.findMany({
      where: {
        OR: [{ departmentId: { in: departmentIds } }, { user: { email: { startsWith: prefix } } }],
      },
      select: { id: true },
    })
  ).map((p) => p.id);
  const runs = (
    await prisma.payrollRun.findMany({ where: { year: { in: years } }, select: { id: true } })
  ).map((r) => r.id);
  const payslips = (
    await prisma.payslip.findMany({
      where: { OR: [{ payrollRunId: { in: runs } }, { employeeId: { in: people } }] },
      select: { id: true },
    })
  ).map((p) => p.id);
  const settlements = (
    await prisma.settlement.findMany({
      where: { employeeId: { in: people } },
      select: { id: true },
    })
  ).map((s) => s.id);
  const adjustments = (
    await prisma.payrollAdjustment.findMany({
      where: { OR: [{ employeeId: { in: people } }, { year: { in: years } }] },
      select: { id: true },
    })
  ).map((a) => a.id);

  await prisma.assetRecovery.updateMany({
    where: { employeeId: { in: people } },
    data: { adjustmentId: null, settlementId: null },
  });
  await prisma.expenseClaim.updateMany({
    where: { employeeId: { in: people } },
    data: { payslipId: null, settlementId: null },
  });
  await prisma.payrollAdjustment.deleteMany({ where: { id: { in: adjustments } } });
  await prisma.payslip.deleteMany({ where: { id: { in: payslips } } });
  await prisma.settlement.deleteMany({ where: { id: { in: settlements } } });
  await prisma.payrollRun.deleteMany({ where: { id: { in: runs } } });
  await prisma.auditLog.deleteMany({
    where: {
      OR: [
        {
          entity: {
            in: [
              'PAYROLL_RUN',
              'PAYSLIP',
              'PAYROLL_ADJUSTMENT',
              'SETTLEMENT',
              'EMPLOYEE_SALARY_STRUCTURE',
            ],
          },
          entityId: { in: [...runs, ...payslips, ...adjustments, ...settlements, ...people] },
        },
        { entity: 'SALARY_STRUCTURE' },
      ],
    },
  });
  await prisma.outboxEvent.deleteMany({
    where: {
      OR: [...runs, ...settlements].map((id) => ({ payload: { path: ['runId'], equals: id } })),
    },
  });
  await prisma.employee.updateMany({
    where: { id: { in: people } },
    data: { salaryStructureId: null },
  });
  await prisma.salaryStructure.deleteMany({ where: { name: { startsWith: prefix } } });
  await cleanExpenseData(prefix, departmentIds);
  await cleanActors(prefix);
}
