import { afterAll, beforeAll, expect, it } from 'vitest';
import { prisma } from '@erp/db';
import { leaveDaysFor } from './leave.grid.js';
import { cleanActors, makeActor } from '../../test-utils/access.js';
const prefix = 'zzleagrid';
let actor: Awaited<ReturnType<typeof makeActor>>;
let employeeId: string;
let departmentId: string;
let typeId: string;
beforeAll(async () => {
  actor = await makeActor(prefix, 'STANDARD');
  departmentId = (await prisma.department.create({ data: { name: `${prefix}-${Date.now()}` } })).id;
  employeeId = (await prisma.employee.create({ data: { userId: actor.user.id, employeeCode: `${prefix}-${Date.now()}`, fullName: 'Leave Grid', designation: 'Engineer', departmentId, employmentType: 'FULL_TIME', joiningDate: new Date('2026-01-01T00:00:00Z') } })).id;
  typeId = (await prisma.leaveType.create({ data: { code: `${prefix}-${Date.now()}`, name: `${prefix}-${Date.now()}`, annualQuota: 10, eligibleFor: ['FULL_TIME'] } })).id;
  await prisma.leaveRequest.createMany({ data: [
    { employeeId, leaveTypeId: typeId, startDate: new Date('2026-03-02T00:00:00Z'), endDate: new Date('2026-03-03T00:00:00Z'), chargedDays: 2, status: 'APPROVED' },
    { employeeId, leaveTypeId: typeId, startDate: new Date('2026-03-04T00:00:00Z'), endDate: new Date('2026-03-04T00:00:00Z'), chargedDays: 1, status: 'PENDING' },
  ] });
});
afterAll(async () => { await prisma.leaveRequest.deleteMany({ where: { employeeId } }); await prisma.leaveType.delete({ where: { id: typeId } }); await prisma.employee.delete({ where: { id: employeeId } }); await prisma.department.delete({ where: { id: departmentId } }); await cleanActors(prefix); });
it('returns only approved leave dates for the requested employees and month', async () => {
  const result = await leaveDaysFor([employeeId], '2026-03');
  expect([...result.get(employeeId)!]).toEqual(['2026-03-02', '2026-03-03']);
});
