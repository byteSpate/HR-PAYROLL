import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '@erp/db';
import { createApp } from '../../app.js';
import { cleanActors, makeActor } from '../../test-utils/access.js';

const prefix = 'zzreportapi';
const app = createApp();
const stamp = Date.now();
let admin: Awaited<ReturnType<typeof makeActor>>;
let manager: Awaited<ReturnType<typeof makeActor>>;
let plain: Awaited<ReturnType<typeof makeActor>>;
let outsider: Awaited<ReturnType<typeof makeActor>>;
let departmentId: string;
const emp = { manager: '', report: '', outsider: '' };

const mk = async (userId: string, label: string, reportingManagerId?: string) =>
  (
    await prisma.employee.create({
      data: {
        userId,
        employeeCode: `${prefix}-${label}-${stamp}`,
        fullName: `Rep ${label}`,
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
  manager = await makeActor(prefix, 'STANDARD', ['attendance.report:team']);
  plain = await makeActor(prefix, 'STANDARD');
  outsider = await makeActor(prefix, 'STANDARD');
  departmentId = (await prisma.department.create({ data: { name: `${prefix}-${stamp}` } })).id;
  emp.manager = await mk(manager.user.id, 'manager');
  emp.report = await mk(plain.user.id, 'report', emp.manager);
  emp.outsider = await mk(outsider.user.id, 'outsider');
  await prisma.attendance.create({
    data: {
      employeeId: emp.report,
      date: new Date('2026-03-04T00:00:00Z'),
      checkIn: new Date('2026-03-04T03:00:00Z'),
      checkOut: new Date('2026-03-04T12:00:00Z'),
      workedHours: 9,
    },
  });
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { changedBy: { in: [admin.user.id, manager.user.id] }, action: 'EXPORT' } });
  await prisma.attendance.deleteMany({ where: { employeeId: { in: Object.values(emp) } } });
  await prisma.employee.updateMany({ where: { id: { in: Object.values(emp) } }, data: { reportingManagerId: null } });
  await prisma.employee.deleteMany({ where: { id: { in: Object.values(emp) } } });
  await prisma.department.delete({ where: { id: departmentId } });
  await cleanActors(prefix);
});

const get = (query: string, who = admin) => request(app).get(`/api/attendance/report?${query}`).set(who.header);
const MARCH = 'from=2026-03-01&to=2026-03-31';

describe('GET /api/attendance/report', () => {
  it('needs attendance.report', async () => {
    expect((await get(MARCH, plain)).status).toBe(403);
  });

  it('reports a range per person, with totals, as the screen and the payroll summary agree', async () => {
    const res = await get(MARCH);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ from: '2026-03-01', to: '2026-03-31', granularity: 'summary' });
    expect(res.body.days).toEqual([]);
    const row = res.body.rows.find((r: { employee: { id: string } }) => r.employee.id === emp.report);
    expect(row).toMatchObject({ present: 1, pendingApproval: 1, workedHours: 9, department: `${prefix}-${stamp}` });
    expect(row.employee.fullName).toBe('Rep report');
    expect(res.body.headcount).toBe(res.body.rows.length);
    expect(res.body.totals.present).toBeGreaterThanOrEqual(1);
  });

  it('lists every day when asked for the daily granularity', async () => {
    const res = await get(`${MARCH}&granularity=daily&employeeId=${emp.report}`);
    expect(res.status).toBe(200);
    expect(res.body.granularity).toBe('daily');
    expect(res.body.rows).toEqual([]);
    expect(res.body.days).toHaveLength(31);
    expect(res.body.days.find((d: { date: string }) => d.date === '2026-03-04')).toMatchObject({ status: 'PRESENT', workedHours: 9 });
  });

  it('limits a team report to direct reports', async () => {
    const res = await get(MARCH, manager);
    expect(res.status).toBe(200);
    expect(res.body.rows.map((r: { employee: { id: string } }) => r.employee.id)).toEqual([emp.report]);
  });

  it('will not report on someone outside the caller\'s reach', async () => {
    expect((await get(`${MARCH}&employeeId=${emp.outsider}`, manager)).status).toBe(404);
  });

  it('refuses a missing, backwards or oversized range with 400', async () => {
    expect((await get('from=2026-03-01')).status).toBe(400);
    expect((await get('from=2026-03-10&to=2026-03-01')).status).toBe(400);
    expect((await get('from=2025-01-01&to=2026-03-31')).status).toBe(400);
    expect((await get('from=nope&to=2026-03-31')).status).toBe(400);
  });

  it('downloads a csv for Excel, and audits exactly one export', async () => {
    const res = await get(`${MARCH}&format=csv`, manager);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="[^"]+\.csv"/);
    expect(res.text.startsWith('﻿')).toBe(true);
    expect(res.text).toContain('Rep report');
    expect(await prisma.auditLog.count({ where: { changedBy: manager.user.id, action: 'EXPORT' } })).toBe(1);
  });

  it('says plainly that the PDF is not available yet', async () => {
    const res = await get(`${MARCH}&format=pdf`);
    expect(res.status).toBe(501);
    expect(res.body.error).toMatch(/pdf/i);
  });
});
