import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { prisma } from '@erp/db';
import { regulariseAttendance, correctAttendance } from './attendance.edit.js';
import { cleanActors, makeActor } from '../../test-utils/access.js';
import { officeToday } from './attendance.time.js';

const prefix = 'zzattedit';
let user: Awaited<ReturnType<typeof makeActor>>;
let manager: Awaited<ReturnType<typeof makeActor>>;
let employeeId: string;
let managerId: string;
let departmentId: string;
let rowId: string;
const admin = () => ({ sub: manager.user.id, accessLevel: 'ADMIN' as const, grants: [] });

beforeAll(async () => {
  user = await makeActor(prefix, 'STANDARD');
  manager = await makeActor(prefix, 'STANDARD');
  departmentId = (await prisma.department.create({ data: { name: `${prefix}-${Date.now()}` } })).id;
  const base = { designation: 'Engineer', departmentId, employmentType: 'FULL_TIME' as const, joiningDate: new Date('2026-01-01T00:00:00Z') };
  managerId = (await prisma.employee.create({ data: { ...base, userId: manager.user.id, employeeCode: `${prefix}-m-${Date.now()}`, fullName: 'Manager' } })).id;
  employeeId = (await prisma.employee.create({ data: { ...base, userId: user.user.id, employeeCode: `${prefix}-e-${Date.now()}`, fullName: 'Employee', reportingManagerId: managerId } })).id;
});
afterEach(async () => {
  await prisma.outboxEvent.deleteMany({ where: { type: 'attendance.corrected', payload: { path: ['attendanceId'], equals: rowId } } });
  await prisma.notification.deleteMany({ where: { userId: { in: [user.user.id, manager.user.id] } } });
  await prisma.auditLog.deleteMany({ where: { entity: 'ATTENDANCE', entityId: rowId } });
  await prisma.attendanceAudit.deleteMany({ where: { attendanceId: rowId } });
  await prisma.attendance.deleteMany({ where: { employeeId } });
});
afterAll(async () => {
  await prisma.employee.update({ where: { id: employeeId }, data: { reportingManagerId: null } });
  await prisma.employee.deleteMany({ where: { id: { in: [employeeId, managerId] } } });
  await prisma.department.delete({ where: { id: departmentId } });
  await cleanActors(prefix);
});

describe('attendance edits', () => {
  it('regularises an own record back to pending and notifies the manager', async () => {
    const date = new Date(officeToday().getTime() - 3 * 86_400_000);
    rowId = (await prisma.attendance.create({ data: { employeeId, date, approval: 'REJECTED' } })).id;
    const result = await regulariseAttendance(user.user.id, rowId, { checkIn: '09:00', checkOut: '18:00', note: 'Forgot to punch' });
    expect(result).toEqual({ id: rowId, approval: 'PENDING' });
    const row = await prisma.attendance.findUniqueOrThrow({ where: { id: rowId } });
    expect(row).toMatchObject({ approval: 'PENDING', regularisedNote: 'Forgot to punch', workedHours: 9 });
    expect(row.regularisedAt).toBeInstanceOf(Date);
    expect(await prisma.notification.count({ where: { userId: manager.user.id, entityId: rowId } })).toBe(1);
  });
  it('does not reset a record an approver approved after the employee’s request began', async () => {
    const date = new Date(officeToday().getTime() - 3 * 86_400_000);
    const decidedAt = new Date();
    rowId = (await prisma.attendance.create({ data: { employeeId, date, checkIn: new Date(date.getTime() + 3 * 3_600_000), approval: 'APPROVED', decidedBy: manager.user.id, decidedAt } })).id;
    // The pre-check read still sees the record as pending: the approval lands between that read and the write.
    const real = prisma.attendance.findUnique.bind(prisma.attendance);
    const stale = vi.spyOn(prisma.attendance, 'findUnique').mockImplementationOnce((async (args: never) => ({ ...(await real(args)), approval: 'PENDING' })) as never);
    const status = await regulariseAttendance(user.user.id, rowId, { checkOut: '18:00', note: 'Late edit' }).then(() => 0, (e: { status?: number }) => e.status);
    stale.mockRestore();
    expect(status).toBe(409);
    const row = await prisma.attendance.findUniqueOrThrow({ where: { id: rowId } });
    expect(row).toMatchObject({ approval: 'APPROVED', decidedBy: manager.user.id, checkOut: null, regularisedNote: null });
    expect(await prisma.attendanceAudit.count({ where: { attendanceId: rowId } })).toBe(0);
  });
  it('refuses another person’s record and a record that does not exist', async () => {
    const date = new Date(officeToday().getTime() - 3 * 86_400_000);
    rowId = (await prisma.attendance.create({ data: { employeeId, date, checkIn: new Date(date.getTime() + 3 * 3_600_000) } })).id;
    const status = (p: Promise<unknown>) => p.then(() => 0, (e: { status?: number }) => e.status);
    expect(await status(regulariseAttendance(manager.user.id, rowId, { checkOut: '18:00', note: 'Not mine' }))).toBe(403);
    expect(await status(regulariseAttendance(user.user.id, 'no-such-id', { checkOut: '18:00', note: 'Missing' }))).toBe(404);
  });
  it('correction records old and new times in an attendance audit', async () => {
    const old = new Date('2026-03-02T03:00:00Z');
    rowId = (await prisma.attendance.create({ data: { employeeId, date: new Date('2026-03-02T00:00:00Z'), checkIn: old } })).id;
    await correctAttendance(admin(), rowId, { checkIn: '10:00', note: 'Corrected' });
    const audit = await prisma.attendanceAudit.findFirstOrThrow({ where: { attendanceId: rowId } });
    expect(audit.before).toMatchObject({ checkIn: old.toISOString() });
    expect(audit.after).toMatchObject({ checkIn: '2026-03-02T04:00:00.000Z' });
  });
});
