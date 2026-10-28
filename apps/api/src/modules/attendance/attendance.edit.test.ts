import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@erp/db';
import { regulariseAttendance, correctAttendance } from './attendance.edit.js';
import { cleanActors, makeActor } from '../../test-utils/access.js';

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
    rowId = (await prisma.attendance.create({ data: { employeeId, date: new Date('2026-03-02T00:00:00Z'), approval: 'REJECTED' } })).id;
    const row = await regulariseAttendance(user.user.id, { date: '2026-03-02', checkIn: '09:00', checkOut: '18:00', note: 'Forgot to punch' });
    expect(row).toMatchObject({ approval: 'PENDING', regularisedNote: 'Forgot to punch', workedHours: 9 });
    expect(row.regularisedAt).toBeInstanceOf(Date);
    expect(await prisma.notification.count({ where: { userId: manager.user.id, entityId: rowId } })).toBe(1);
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
