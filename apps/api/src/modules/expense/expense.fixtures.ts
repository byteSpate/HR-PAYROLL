import { prisma } from '@erp/db';
import { formatDateOnly, officeToday } from '@erp/export';
import { cleanActors, makeActor } from '../../test-utils/access.js';

/** The day `back` days before today in the office calendar, as YYYY-MM-DD. */
export const daysAgo = (back: number) => formatDateOnly(new Date(officeToday().getTime() - back * 86_400_000));

/** A department, so the people a test hires share one and can be told apart from other files' data. */
export function makeDepartment(prefix: string) {
  return prisma.department.create({ data: { name: `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` } });
}

let seq = 0;

/** An actor with a login and an employee record, optionally reporting to `managerEmployeeId`. */
export async function hireActor(prefix: string, departmentId: string, grants: string[] = [], opts: { managerEmployeeId?: string; admin?: boolean } = {}) {
  const actor = await makeActor(prefix, opts.admin ? 'ADMIN' : 'STANDARD', grants);
  const n = seq++;
  const employee = await prisma.employee.create({
    data: {
      userId: actor.user.id,
      employeeCode: `${prefix}-${Date.now()}-${n}`,
      fullName: `${prefix} person ${n}`,
      designation: 'Engineer',
      departmentId,
      employmentType: 'FULL_TIME',
      joiningDate: new Date('2026-01-01T00:00:00Z'),
      ...(opts.managerEmployeeId ? { reportingManagerId: opts.managerEmployeeId } : {}),
    },
  });
  return { ...actor, employee };
}

/** Removes what a test file made under `prefix`: claims and their trail, categories, people, departments and actors. */
export async function cleanExpenseData(prefix: string, departmentIds: string[], extraCategoryIds: string[] = []) {
  // By login prefix as well as department, so a run that died half way cannot leave an employee blocking the next one.
  const people = (await prisma.employee.findMany({ where: { OR: [{ departmentId: { in: departmentIds } }, { user: { email: { startsWith: prefix } } }] }, select: { id: true } })).map((p) => p.id);
  const claimIds = (await prisma.expenseClaim.findMany({ where: { employeeId: { in: people } }, select: { id: true } })).map((c) => c.id);
  const categoryIds = [...(await prisma.expenseCategory.findMany({ where: { code: { startsWith: prefix.toUpperCase() } }, select: { id: true } })).map((c) => c.id), ...extraCategoryIds];
  await prisma.outboxEvent.deleteMany({ where: { OR: claimIds.map((id) => ({ payload: { path: ['claimId'], equals: id } })) } });
  await prisma.auditLog.deleteMany({ where: { OR: [{ entity: 'EXPENSE_CLAIM', entityId: { in: claimIds } }, { entity: 'EXPENSE_CATEGORY', entityId: { in: categoryIds } }] } });
  await prisma.notification.deleteMany({ where: { entity: 'EXPENSE_CLAIM', entityId: { in: claimIds } } });
  await prisma.expenseAttachment.deleteMany({ where: { claimId: { in: claimIds } } });
  await prisma.expenseClaim.deleteMany({ where: { id: { in: claimIds } } });
  await prisma.expenseCategory.deleteMany({ where: { id: { in: categoryIds } } });
  await prisma.employee.updateMany({ where: { id: { in: people } }, data: { reportingManagerId: null } });
  await prisma.employee.deleteMany({ where: { id: { in: people } } });
  await prisma.department.deleteMany({ where: { OR: [{ id: { in: departmentIds } }, { name: { startsWith: prefix } }] } });
  await cleanActors(prefix);
}
