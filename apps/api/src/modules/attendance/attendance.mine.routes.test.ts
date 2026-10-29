import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '@erp/db';
import { createApp } from '../../app.js';
import { cleanActors, makeActor } from '../../test-utils/access.js';
import { officeToday } from './attendance.time.js';

const prefix = 'zzmineroutes';
const app = createApp();
let alice: Awaited<ReturnType<typeof makeActor>>;
let bob: Awaited<ReturnType<typeof makeActor>>;
let departmentId: string;
let employeeId: string;
let bobEmployeeId: string;

beforeAll(async () => {
  alice = await makeActor(prefix, 'STANDARD');
  bob = await makeActor(prefix, 'STANDARD');
  departmentId = (await prisma.department.create({ data: { name: `${prefix}-${Date.now()}` } })).id;
  employeeId = (await prisma.employee.create({ data: {
    userId: alice.user.id, employeeCode: `${prefix}-${Date.now()}`, fullName: 'Alice', designation: 'Engineer', departmentId,
    employmentType: 'FULL_TIME', joiningDate: new Date('2026-01-01T00:00:00Z'),
  } })).id;
  bobEmployeeId = (await prisma.employee.create({ data: {
    userId: bob.user.id, employeeCode: `${prefix}-bob-${Date.now()}`, fullName: 'Bob', designation: 'Engineer', departmentId,
    employmentType: 'FULL_TIME', joiningDate: new Date('2026-01-01T00:00:00Z'),
  } })).id;
});
afterAll(async () => {
  await prisma.attendance.deleteMany({ where: { employeeId: { in: [employeeId, bobEmployeeId] } } });
  await prisma.employee.deleteMany({ where: { id: { in: [employeeId, bobEmployeeId] } } });
  await prisma.department.delete({ where: { id: departmentId } });
  await cleanActors(prefix);
});

describe('my attendance routes', () => {
  it('requires authentication and an employee record', async () => {
    expect((await request(app).post('/api/attendance/check-in')).status).toBe(401);
    const noEmployee = await makeActor(prefix, 'STANDARD');
    expect((await request(app).post('/api/attendance/check-in').set(noEmployee.header)).status).toBe(403);
  });
  it('punches in and out, rejecting duplicates', async () => {
    expect((await request(app).post('/api/attendance/check-in').set(alice.header)).status).toBe(201);
    expect((await request(app).post('/api/attendance/check-in').set(alice.header)).status).toBe(409);
    expect((await request(app).post('/api/attendance/check-out').set(alice.header)).status).toBe(200);
  });
  it('returns the caller’s own derived days for a range and rejects a backwards one', async () => {
    await prisma.attendance.create({ data: { employeeId, date: new Date('2026-03-02T00:00:00Z'), checkIn: new Date('2026-03-02T03:00:00Z') } });
    await prisma.attendance.create({ data: { employeeId: bobEmployeeId, date: new Date('2026-03-03T00:00:00Z') } });
    const response = await request(app).get('/api/attendance/me?from=2026-03-01&to=2026-03-31').set(alice.header);
    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(31);
    const own = response.body.filter((day: { attendanceId: string | null }) => day.attendanceId);
    expect(own).toHaveLength(1);
    expect(own[0]).toMatchObject({ date: '2026-03-02', status: 'PRESENT' });
    expect((await request(app).get('/api/attendance/me?from=2026-03-31&to=2026-03-01').set(alice.header)).status).toBe(400);
    const bobDays = (await request(app).get('/api/attendance/me?from=2026-03-01&to=2026-03-31').set(bob.header)).body;
    expect(bobDays.filter((day: { attendanceId: string | null }) => day.attendanceId).map((day: { date: string }) => day.date)).toEqual(['2026-03-03']);
  });
  it('summarises the caller’s own month, whatever their attendance grants', async () => {
    const res = await request(app).get('/api/attendance/summary/me?month=3&year=2026').set(alice.header);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ month: 3, year: 2026, present: 1, employee: { id: employeeId } });
    expect((await request(app).get('/api/attendance/summary/me?month=13&year=2026').set(alice.header)).status).toBe(400);
    const noEmployee = await makeActor(prefix, 'STANDARD');
    expect((await request(app).get('/api/attendance/summary/me?month=3&year=2026').set(noEmployee.header)).status).toBe(403);
  });
  it('says what the punch card may do today, from the server clock', async () => {
    const fresh = await request(app).get('/api/attendance/today').set(bob.header);
    expect(fresh.status).toBe(200);
    expect(fresh.body).toMatchObject({ canCheckIn: true, canCheckOut: false, checkIn: null });
    expect(new Date(fresh.body.serverTime).getTime()).toBeGreaterThan(Date.now() - 60_000);
    expect(fresh.body.shift).toMatchObject({ startTime: expect.any(String), expectedHours: expect.any(Number) });
    const done = await request(app).get('/api/attendance/today').set(alice.header);
    expect(done.body).toMatchObject({ canCheckIn: false, canCheckOut: false });
    expect((await request(app).get('/api/attendance/today')).status).toBe(401);
  });
  it('offers check-out for a shift opened before midnight, and no new check-in while it is open', async () => {
    const night = await makeActor(prefix, 'STANDARD');
    const nightEmployee = await prisma.employee.create({ data: { userId: night.user.id, employeeCode: `${prefix}-night-${Date.now()}`, fullName: 'Night', designation: 'Operator', departmentId, employmentType: 'FULL_TIME', joiningDate: new Date('2026-01-01T00:00:00Z') } });
    try {
      const yesterday = new Date(officeToday().getTime() - 86_400_000);
      const open = await prisma.attendance.create({ data: { employeeId: nightEmployee.id, date: yesterday, checkIn: new Date(Date.now() - 3 * 3_600_000) } });
      const today = await request(app).get('/api/attendance/today').set(night.header);
      expect(today.body).toMatchObject({ canCheckIn: false, canCheckOut: true, checkIn: open.checkIn!.toISOString() });
      expect((await request(app).post('/api/attendance/check-out').set(night.header)).status).toBe(200);
      const after = await request(app).get('/api/attendance/today').set(night.header);
      expect(after.body).toMatchObject({ canCheckOut: false });
    } finally {
      await prisma.attendance.deleteMany({ where: { employeeId: nightEmployee.id } });
      await prisma.employee.delete({ where: { id: nightEmployee.id } });
    }
  });
  it('does not offer a check-out the server would refuse, once the open shift is too old to close', async () => {
    const stale = await makeActor(prefix, 'STANDARD');
    const staleEmployee = await prisma.employee.create({ data: { userId: stale.user.id, employeeCode: `${prefix}-stale-${Date.now()}`, fullName: 'Stale', designation: 'Operator', departmentId, employmentType: 'FULL_TIME', joiningDate: new Date('2026-01-01T00:00:00Z') } });
    try {
      const yesterday = new Date(officeToday().getTime() - 86_400_000);
      await prisma.attendance.create({ data: { employeeId: staleEmployee.id, date: yesterday, checkIn: new Date(Date.now() - 20 * 3_600_000) } });
      const today = await request(app).get('/api/attendance/today').set(stale.header);
      expect(today.body).toMatchObject({ canCheckIn: true, canCheckOut: false });
    } finally {
      await prisma.attendance.deleteMany({ where: { employeeId: staleEmployee.id } });
      await prisma.employee.delete({ where: { id: staleEmployee.id } });
    }
  });
  it('lets an employee amend only their own unapproved, recent day', async () => {
    const day = officeToday();
    const at = (back: number) => new Date(day.getTime() - back * 86_400_000);
    const open = await prisma.attendance.create({ data: { employeeId, date: at(1), checkIn: new Date(at(1).getTime() + 3 * 3_600_000) } });
    const patch = (id: string, who = alice, body: object = { checkOut: '18:00', note: 'Forgot to punch out' }) =>
      request(app).patch(`/api/attendance/me/${id}/regularise`).set(who.header).send(body);

    const ok = await patch(open.id);
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ id: open.id, approval: 'PENDING' });
    expect((await prisma.attendance.findUniqueOrThrow({ where: { id: open.id } })).regularisedNote).toBe('Forgot to punch out');
    expect((await patch(open.id, bob)).status).toBe(403);
    expect((await patch(open.id, alice, { checkOut: '18:00' })).status).toBe(400);

    const approved = await prisma.attendance.create({ data: { employeeId, date: at(2), approval: 'APPROVED' } });
    expect((await patch(approved.id)).status).toBe(409);
    const old = await prisma.attendance.create({ data: { employeeId, date: at(30), checkIn: new Date(at(30).getTime() + 3 * 3_600_000) } });
    expect((await patch(old.id)).status).toBe(409);
  });
});
