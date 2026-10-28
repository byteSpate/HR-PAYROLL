import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@erp/db';
import { applyForLeave, decideLeave, cancelLeave, balancesFor } from './leave.service.js';
import { cleanActors, makeActor } from '../../test-utils/access.js';

const prefix = 'zzleavesvc';
let manager: Awaited<ReturnType<typeof makeActor>>;
let employee: Awaited<ReturnType<typeof makeActor>>;
let managerId: string;
let employeeId: string;
let departmentId: string;
let typeId: string;
const viewer = () => ({ sub: manager.user.id, accessLevel: 'STANDARD' as const, grants: ['leave.approve:team'] });
const status = (p: Promise<unknown>) => p.then(() => 0, (e: { status?: number }) => e.status);
const input = () => ({ leaveTypeId: typeId, startDate: '2027-01-04', endDate: '2027-01-04', startSession: 'FIRST_HALF', endSession: 'SECOND_HALF', reason: 'Rest' });
beforeAll(async () => {
  manager = await makeActor(prefix, 'STANDARD');
  employee = await makeActor(prefix, 'STANDARD');
  departmentId = (await prisma.department.create({ data: { name: `${prefix}-${Date.now()}` } })).id;
  const base = { departmentId, designation: 'Engineer', employmentType: 'FULL_TIME' as const, joiningDate: new Date('2025-01-01T00:00:00Z') };
  managerId = (await prisma.employee.create({ data: { ...base, userId: manager.user.id, employeeCode: `${prefix}-m-${Date.now()}`, fullName: 'Manager' } })).id;
  employeeId = (await prisma.employee.create({ data: { ...base, userId: employee.user.id, employeeCode: `${prefix}-e-${Date.now()}`, fullName: 'Employee', reportingManagerId: managerId } })).id;
  typeId = (await prisma.leaveType.create({ data: { code: `${prefix}-${Date.now()}`, name: `${prefix}-${Date.now()}`, annualQuota: 10, eligibleFor: ['FULL_TIME'] } })).id;
});
afterEach(async () => {
  const requests = await prisma.leaveRequest.findMany({ where: { employeeId }, select: { id: true } });
  await prisma.outboxEvent.deleteMany({ where: { OR: requests.map(r => ({ payload: { path: ['requestId'], equals: r.id } })) } });
  await prisma.notification.deleteMany({ where: { userId: { in: [manager.user.id, employee.user.id] } } });
  await prisma.auditLog.deleteMany({ where: { entity: 'LEAVE_REQUEST', entityId: { in: requests.map(r => r.id) } } });
  await prisma.attendance.deleteMany({ where: { employeeId } });
  await prisma.leaveType.update({ where: { id: typeId }, data: { accrualBasis: 'PRO_RATED', minServiceMonths: 0 } });
  await prisma.leaveRequest.deleteMany({ where: { employeeId } });
  await prisma.leaveBalance.deleteMany({ where: { employeeId } });
});
afterAll(async () => {
  await prisma.leaveType.delete({ where: { id: typeId } });
  await prisma.employee.update({ where: { id: employeeId }, data: { reportingManagerId: null } });
  await prisma.employee.deleteMany({ where: { id: { in: [employeeId, managerId] } } });
  await prisma.department.delete({ where: { id: departmentId } });
  await cleanActors(prefix);
});
describe('leave requests', () => {
  it('rejects overlap but accepts disjoint half-day sessions', async () => {
    await applyForLeave(employee.user.id, { ...input(), endSession: 'FIRST_HALF' });
    expect(await status(applyForLeave(employee.user.id, { ...input(), endSession: 'FIRST_HALF' }))).toBe(409);
    const second = await applyForLeave(employee.user.id, { ...input(), startSession: 'SECOND_HALF' });
    expect(second.chargedDays).toBe(0.5);
  });
  it('uses earned attendance accrual when creating a balance', async () => {
    await prisma.leaveType.update({ where: { id: typeId }, data: { accrualBasis: 'EARNED', minServiceMonths: 12 } });
    await prisma.attendance.createMany({ data: Array.from({ length: 18 }, (_, i) => ({ employeeId, date: new Date(Date.UTC(2026, 2, i + 1)), checkIn: new Date(Date.UTC(2026, 2, i + 1, 3)) })) });
    const row = await applyForLeave(employee.user.id, input());
    expect(row.chargedDays).toBe(1);
    expect((await prisma.leaveBalance.findUniqueOrThrow({ where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId: typeId, year: 2027 } } })).balance).toBe(1);
  });
  it('applies each earned policy minimum service when showing balances', async () => {
    await prisma.leaveType.update({ where: { id: typeId }, data: { accrualBasis: 'EARNED', minServiceMonths: 100 } });
    await prisma.attendance.createMany({ data: Array.from({ length: 18 }, (_, i) => ({ employeeId, date: new Date(Date.UTC(2026, 2, i + 1)), checkIn: new Date(Date.UTC(2026, 2, i + 1, 3)) })) });
    const balances = await balancesFor(employeeId, 2026);
    expect(balances.find(balance => balance.leaveTypeId === typeId)?.balance).toBe(0);
  });
  it('rejects requests exceeding the paid balance', async () => {
    await prisma.leaveBalance.create({ data: { employeeId, leaveTypeId: typeId, year: 2027, accrued: 0.5, balance: 0.5 } });
    expect(await status(applyForLeave(employee.user.id, input()))).toBe(409);
  });
  it('approves a report atomically, notifying and emitting an event', async () => {
    const row = await applyForLeave(employee.user.id, input());
    const result = await decideLeave(viewer(), row.id, 'APPROVED');
    expect(result).toMatchObject({ status: 'APPROVED', decidedBy: manager.user.id, chargedDays: 1 });
    expect(await prisma.leaveBalance.findUniqueOrThrow({ where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId: typeId, year: 2027 } } })).toMatchObject({ used: 1, balance: 9 });
    expect(await prisma.notification.count({ where: { userId: employee.user.id, entityId: row.id } })).toBe(1);
    expect(await prisma.outboxEvent.count({ where: { type: 'leave.approved', payload: { path: ['requestId'], equals: row.id } } })).toBe(1);
    expect(await status(decideLeave(viewer(), row.id, 'APPROVED'))).toBe(409);
  });
  it('restores the balance when an approved future request is cancelled', async () => {
    const row = await applyForLeave(employee.user.id, input());
    await decideLeave(viewer(), row.id, 'APPROVED');
    await cancelLeave({ sub: manager.user.id, accessLevel: 'ADMIN', grants: [] }, row.id);
    expect(await prisma.leaveBalance.findUniqueOrThrow({ where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId: typeId, year: 2027 } } })).toMatchObject({ used: 0, balance: 10 });
  });
  it('rejects non-admin self decisions even with all-scope approval', async () => {
    const row = await applyForLeave(employee.user.id, input());
    expect(await status(decideLeave({ sub: employee.user.id, accessLevel: 'STANDARD', grants: ['leave.approve:all'] }, row.id, 'APPROVED'))).toBe(403);
    expect((await decideLeave({ sub: employee.user.id, accessLevel: 'ADMIN', grants: [] }, row.id, 'APPROVED')).status).toBe('APPROVED');
  });
});
