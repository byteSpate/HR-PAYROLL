import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { prisma } from '@erp/db';
import { checkIn, checkOut } from './attendance.punch.js';
import { getMyAttendance } from './attendance.me.js';
import { cleanActors, makeActor } from '../../test-utils/access.js';

const prefix = 'zzpunch';
let actor: Awaited<ReturnType<typeof makeActor>>;
let other: Awaited<ReturnType<typeof makeActor>>;
let employeeId: string;
let managerId: string;
let departmentId: string;
const status = (p: Promise<unknown>) => p.then(() => 0, (e: { status?: number }) => e.status);

beforeAll(async () => {
  actor = await makeActor(prefix, 'STANDARD');
  other = await makeActor(prefix, 'STANDARD');
  const dept = await prisma.department.create({ data: { name: `${prefix}-${Date.now()}` } });
  departmentId = dept.id;
  managerId = (await prisma.employee.create({ data: { userId: other.user.id, employeeCode: `${prefix}-manager-${Date.now()}`, fullName: 'Manager', designation: 'Engineer', departmentId, employmentType: 'FULL_TIME', joiningDate: new Date('2026-01-01T00:00:00Z') } })).id;
  const employee = await prisma.employee.create({ data: {
    userId: actor.user.id, employeeCode: `${prefix}-${Date.now()}`, fullName: 'Punch Person', designation: 'Engineer',
    departmentId, reportingManagerId: managerId, employmentType: 'FULL_TIME', joiningDate: new Date('2026-01-01T00:00:00Z'),
  } });
  employeeId = employee.id;
});
afterEach(async () => {
  vi.useRealTimers();
  await prisma.notification.deleteMany({ where: { userId: other.user.id } });
  await prisma.attendance.deleteMany({ where: { employeeId } });
});
afterAll(async () => {
  await prisma.employee.delete({ where: { id: employeeId } });
  await prisma.employee.delete({ where: { id: managerId } });
  await prisma.department.delete({ where: { id: departmentId } });
  await cleanActors(prefix);
});

describe('attendance punching', () => {
  it('creates a pending punch on the Dhaka calendar date', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-03-01T23:30:00Z'));
    const row = await checkIn(actor.user.id);
    expect(row).toMatchObject({ approval: 'PENDING', isLate: false, date: '2026-03-02', status: 'PRESENT' });
    expect(row.shift).toMatchObject({ startTime: '09:00', graceMinutes: 15 });
    expect(await prisma.notification.count({ where: { userId: other.user.id, entityId: row.attendanceId } })).toBe(1);
  });
  it('judges a first-half leave day against the half actually worked', async () => {
    const type = await prisma.leaveType.create({ data: { code: `${prefix}-hl`, name: `${prefix} half`, annualQuota: 10 } });
    await prisma.leaveRequest.create({ data: {
      employeeId, leaveTypeId: type.id, startDate: new Date('2026-03-02T00:00:00Z'), endDate: new Date('2026-03-02T00:00:00Z'),
      startSession: 'FIRST_HALF', endSession: 'FIRST_HALF', chargedDays: 0.5, status: 'APPROVED',
    } });
    try {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-03-02T07:40:00Z'));
      const row = await checkIn(actor.user.id);
      expect(row).toMatchObject({ isLate: false, onApprovedLeave: true, leaveTypeName: `${prefix} half` });
    } finally {
      await prisma.leaveRequest.deleteMany({ where: { employeeId } });
      await prisma.leaveType.delete({ where: { id: type.id } });
    }
  });
  it('allows only one of two concurrent check-ins', async () => {
    const outcomes = await Promise.all([status(checkIn(actor.user.id)), status(checkIn(actor.user.id))]);
    expect(outcomes.sort()).toEqual([0, 409]);
    expect(await prisma.attendance.count({ where: { employeeId } })).toBe(1);
    expect(await status(checkIn(actor.user.id))).toBe(409);
  });
  it('requires a check-in and records hours and early departure', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-03-02T03:16:00Z'));
    expect(await status(checkOut(actor.user.id))).toBe(409);
    expect((await checkIn(actor.user.id)).isLate).toBe(true);
    vi.setSystemTime(new Date('2026-03-02T11:00:00Z'));
    expect(await checkOut(actor.user.id)).toMatchObject({ workedHours: 7.73, isEarlyOut: true });
    expect(await status(checkOut(actor.user.id))).toBe(409);
  });
  it('closes an overnight punch on its original day and rejects stale punches', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-03-02T16:00:00Z'));
    await checkIn(actor.user.id);
    vi.setSystemTime(new Date('2026-03-02T18:30:00Z'));
    const row = await checkOut(actor.user.id);
    expect(row.date).toBe('2026-03-02');
    expect(row.isEarlyOut).toBe(false);
    vi.setSystemTime(new Date('2026-03-03T03:00:00Z'));
    await checkIn(actor.user.id);
    vi.setSystemTime(new Date('2026-03-04T00:00:00Z'));
    expect(await status(checkOut(actor.user.id))).toBe(409);
  });
  it('requires an employee record and filters the caller’s month', async () => {
    const noEmployee = await makeActor(prefix, 'STANDARD');
    expect(await status(checkIn(noEmployee.user.id))).toBe(403);
    await prisma.attendance.createMany({ data: [
      { employeeId, date: new Date('2026-03-02T00:00:00Z') },
      { employeeId, date: new Date('2026-04-02T00:00:00Z') },
    ] });
    const rows = (await getMyAttendance(actor.user.id, '2026-03-01', '2026-03-31')).filter((day) => day.attendanceId);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.date).toBe('2026-03-02');
  });
});
