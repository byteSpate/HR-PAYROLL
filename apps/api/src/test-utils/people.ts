import { prisma } from '@erp/db';
import { formatDateOnly, officeToday } from '@erp/export';
import { makeActor } from './access.js';

/** The day `back` days before today in the office calendar, as YYYY-MM-DD. */
export const daysAgo = (back: number) =>
  formatDateOnly(new Date(officeToday().getTime() - back * 86_400_000));

/** A department, so the people a test hires share one and can be told apart from other files' data. */
export function makeDepartment(prefix: string) {
  return prisma.department.create({
    data: { name: `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` },
  });
}

let seq = 0;

/** An actor with a login and an employee record, optionally reporting to `managerEmployeeId`. */
export async function hireActor(
  prefix: string,
  departmentId: string,
  grants: string[] = [],
  opts: { managerEmployeeId?: string; admin?: boolean } = {},
) {
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
