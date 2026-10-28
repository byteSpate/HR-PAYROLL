import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '@erp/db';
import { createApp } from '../../app.js';
import { cleanActors, makeActor } from '../../test-utils/access.js';

const prefix = 'zzsum';
const app = createApp();
const stamp = Date.now();

let admin: Awaited<ReturnType<typeof makeActor>>;
let manager: Awaited<ReturnType<typeof makeActor>>;
let report: Awaited<ReturnType<typeof makeActor>>;
let stranger: Awaited<ReturnType<typeof makeActor>>;
let departmentId = '';
const emp: Record<'manager' | 'report' | 'stranger', string> = { manager: '', report: '', stranger: '' };
let attendanceId = '';

const mkEmployee = async (userId: string, label: string, reportingManagerId?: string) =>
  (
    await prisma.employee.create({
      data: {
        userId,
        employeeCode: `${prefix}-${label}-${stamp}`,
        fullName: `Sum ${label}`,
        designation: 'Engineer',
        departmentId,
        employmentType: 'FULL_TIME',
        joiningDate: new Date('2026-01-01T00:00:00Z'),
        reportingManagerId: reportingManagerId ?? null,
      },
    })
  ).id;

beforeAll(async () => {
  admin = await makeActor(prefix, 'ADMIN');
  manager = await makeActor(prefix, 'STANDARD', ['attendance.read:team', 'attendance.manage:department']);
  report = await makeActor(prefix, 'STANDARD');
  stranger = await makeActor(prefix, 'STANDARD');
  departmentId = (await prisma.department.create({ data: { name: `${prefix}-${stamp}` } })).id;
  emp.manager = await mkEmployee(manager.user.id, 'manager');
  emp.report = await mkEmployee(report.user.id, 'report', emp.manager);
  emp.stranger = await mkEmployee(stranger.user.id, 'stranger');
  // Wednesday 4 March 2026: the report checked in on time and is waiting for a decision.
  const row = await prisma.attendance.create({
    data: {
      employeeId: emp.report,
      date: new Date('2026-03-04T00:00:00Z'),
      checkIn: new Date('2026-03-04T03:00:00Z'),
      checkOut: new Date('2026-03-04T12:00:00Z'),
      workedHours: 9,
    },
  });
  attendanceId = row.id;
  await prisma.attendanceAudit.create({ data: { attendanceId, action: 'CORRECT', changedBy: admin.user.id, before: { checkIn: null }, after: { checkIn: '09:00' }, note: 'Forgot to punch' } });
});

afterAll(async () => {
  await prisma.attendance.deleteMany({ where: { employeeId: { in: Object.values(emp) } } });
  await prisma.employee.updateMany({ where: { id: { in: Object.values(emp) } }, data: { reportingManagerId: null } });
  await prisma.employee.deleteMany({ where: { id: { in: Object.values(emp) } } });
  await prisma.department.delete({ where: { id: departmentId } });
  await cleanActors(prefix);
});

describe('GET /api/attendance/summary/daily', () => {
  it('needs an attendance.read grant', async () => {
    expect((await request(app).get('/api/attendance/summary/daily').set(report.header)).status).toBe(403);
  });

  it('lists each person on the day with their status, and totals the day', async () => {
    const res = await request(app).get('/api/attendance/summary/daily?date=2026-03-04').set(admin.header);
    expect(res.status).toBe(200);
    expect(res.body.date).toBe('2026-03-04');
    const row = res.body.rows.find((r: { employee: { id: string } }) => r.employee.id === emp.report);
    expect(row).toMatchObject({ status: 'PRESENT', isLate: false, approval: 'PENDING', workedHours: 9 });
    expect(row.employee).toMatchObject({ fullName: 'Sum report', designation: 'Engineer' });
    const absent = res.body.rows.find((r: { employee: { id: string } }) => r.employee.id === emp.stranger);
    expect(absent.status).toBe('ABSENT');
    expect(res.body.totals.present).toBeGreaterThanOrEqual(1);
    expect(res.body.totals.pendingApproval).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(res.body.conflicts)).toBe(true);
  });

  it('shows a manager only their own team', async () => {
    const res = await request(app).get('/api/attendance/summary/daily?date=2026-03-04').set(manager.header);
    expect(res.status).toBe(200);
    const ids = res.body.rows.map((r: { employee: { id: string } }) => r.employee.id);
    expect(ids).toContain(emp.report);
    expect(ids).not.toContain(emp.stranger);
  });

  it('rejects a date that is not a date with 400', async () => {
    expect((await request(app).get('/api/attendance/summary/daily?date=nope').set(admin.header)).status).toBe(400);
  });
});

describe('GET /api/attendance/summary/monthly', () => {
  it('summarises a month per person in the payroll contract shape', async () => {
    const res = await request(app).get('/api/attendance/summary/monthly?month=3&year=2026').set(admin.header);
    expect(res.status).toBe(200);
    const row = res.body.find((r: { employee: { id: string } }) => r.employee.id === emp.report);
    expect(row).toMatchObject({ month: 3, year: 2026, present: 1, pendingApproval: 1, late: 0, workedHours: 9 });
    expect(row.workingDays).toBeGreaterThan(20);
    for (const key of ['absent', 'onLeave', 'holidays', 'weeklyOffs', 'expectedHours', 'shortfallHours', 'missingCheckOut', 'approved', 'regularised', 'rejected']) {
      expect(row).toHaveProperty(key);
    }
  });

  it('is scoped like the daily view', async () => {
    const res = await request(app).get('/api/attendance/summary/monthly?month=3&year=2026').set(manager.header);
    const ids = res.body.map((r: { employee: { id: string } }) => r.employee.id);
    expect(ids).toContain(emp.report);
    expect(ids).not.toContain(emp.stranger);
  });

  it('rejects an invalid month with 400', async () => {
    expect((await request(app).get('/api/attendance/summary/monthly?month=13&year=2026').set(admin.header)).status).toBe(400);
    expect((await request(app).get('/api/attendance/summary/monthly?month=x&year=2026').set(admin.header)).status).toBe(400);
  });
});

describe('GET /api/attendance/history/:employeeId', () => {
  it('returns one person\'s derived days for a range', async () => {
    const res = await request(app).get(`/api/attendance/history/${emp.report}?from=2026-03-02&to=2026-03-06`).set(admin.header);
    expect(res.status).toBe(200);
    expect(res.body.map((d: { date: string }) => d.date)).toEqual(['2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05', '2026-03-06']);
    expect(res.body[2]).toMatchObject({ status: 'PRESENT', approval: 'PENDING', attendanceId });
    expect(res.body[4]).toMatchObject({ status: 'WEEKLY_OFF', isWeeklyOff: true });
  });

  it('lets people see their own, and a manager see their reports, but nobody else', async () => {
    const own = await request(app).get(`/api/attendance/history/${emp.report}?from=2026-03-04&to=2026-03-04`).set(report.header);
    expect(own.status).toBe(200);
    expect((await request(app).get(`/api/attendance/history/${emp.report}?from=2026-03-04&to=2026-03-04`).set(manager.header)).status).toBe(200);
    expect((await request(app).get(`/api/attendance/history/${emp.report}?from=2026-03-04&to=2026-03-04`).set(stranger.header)).status).toBe(403);
  });

  it('answers 404 for an unknown employee and 400 for a backwards range', async () => {
    expect((await request(app).get('/api/attendance/history/00000000-0000-4000-8000-000000000000').set(admin.header)).status).toBe(404);
    expect((await request(app).get(`/api/attendance/history/${emp.report}?from=2026-03-06&to=2026-03-02`).set(admin.header)).status).toBe(400);
  });
});

describe('GET /api/attendance/:id/audit', () => {
  it('lists what was changed, newest first, to those who manage attendance', async () => {
    const res = await request(app).get(`/api/attendance/${attendanceId}/audit`).set(manager.header);
    expect(res.status).toBe(200);
    expect(res.body[0]).toMatchObject({ action: 'CORRECT', note: 'Forgot to punch', before: { checkIn: null }, after: { checkIn: '09:00' } });
    expect(typeof res.body[0].changedAt).toBe('string');
  });

  it('is closed to everyone else, and 404s on an unknown record', async () => {
    expect((await request(app).get(`/api/attendance/${attendanceId}/audit`).set(stranger.header)).status).toBe(403);
    expect((await request(app).get('/api/attendance/00000000-0000-4000-8000-000000000000/audit').set(admin.header)).status).toBe(404);
  });
});
