import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '@erp/db';
import { createApp } from '../../app.js';
import { cleanActors, makeActor } from '../../test-utils/access.js';
import { hire, removeEmployees } from './employee.fixtures.js';

const app = createApp();
const P = 'zztest10x';
let dep: string;
let hr: { Authorization: string };
let finance: { Authorization: string };

beforeAll(async () => {
  await removeEmployees(P);
  await prisma.department.deleteMany({ where: { name: { startsWith: P } } });
  dep = (await prisma.department.create({ data: { name: `${P} Dept` } })).id;
  hr = (
    await makeActor(P, 'STANDARD', [
      'employee.create',
      'employee.read:all',
      'employee.update:all',
      'employee.exit:all',
      'employee.export',
    ])
  ).header;
  finance = (await makeActor(P, 'STANDARD', ['employee.read.financial', 'employee.export'])).header;
});
afterEach(() => removeEmployees(P));
afterAll(async () => {
  await cleanActors(P);
  await prisma.department.deleteMany({ where: { name: { startsWith: P } } });
});

describe('exit', () => {
  it('records a past exit as RESIGNED, deactivates the login and emits employee.exited', async () => {
    const e = await hire(app, P, hr, dep);
    const res = await request(app)
      .patch(`/api/employees/${e.id}/exit`)
      .set(hr)
      .send({ lastWorkingDay: '2026-02-28', exitReason: 'RESIGNATION' });
    expect(res.status).toBe(200);
    const row = await prisma.employee.findUniqueOrThrow({ where: { id: e.id }, include: { user: true } });
    expect(row.employmentStatus).toBe('RESIGNED');
    expect(row.user.isActive).toBe(false);
    expect(await prisma.outboxEvent.count({ where: { type: 'employee.exited' } })).toBe(1);
  });

  it('maps a dismissal to TERMINATED and keeps a future leaver active until the day', async () => {
    const e = await hire(app, P, hr, dep);
    await request(app)
      .patch(`/api/employees/${e.id}/exit`)
      .set(hr)
      .send({ lastWorkingDay: '2099-12-31', exitReason: 'DISMISSAL' });
    const row = await prisma.employee.findUniqueOrThrow({ where: { id: e.id }, include: { user: true } });
    expect(row.employmentStatus).toBe('TERMINATED');
    expect(row.user.isActive).toBe(true);
  });

  it('refuses a last working day before the joining date, and callers without employee.exit', async () => {
    const e = await hire(app, P, hr, dep);
    const early = await request(app).patch(`/api/employees/${e.id}/exit`).set(hr).send({ lastWorkingDay: '2025-01-01', exitReason: 'RESIGNATION' });
    expect(early.status).toBe(400);
    const denied = await request(app).patch(`/api/employees/${e.id}/exit`).set(finance).send({ lastWorkingDay: '2026-03-01', exitReason: 'RESIGNATION' });
    expect(denied.status).toBe(403);
  });
});

describe('account toggle', () => {
  it('deactivates and reactivates the employee login', async () => {
    const e = await hire(app, P, hr, dep);
    expect((await request(app).patch(`/api/employees/${e.id}/account`).set(hr).send({ isActive: false })).status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: e.userId } })).isActive).toBe(false);
    await request(app).patch(`/api/employees/${e.id}/account`).set(hr).send({ isActive: true });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: e.userId } })).isActive).toBe(true);
  });
});

describe('export', () => {
  it('gives finance bank columns but no personal columns', async () => {
    await hire(app, P, hr, dep);
    const res = await request(app).get('/api/employees/export?format=csv').set(finance);
    expect(res.status).toBe(200);
    const header = res.text.replace(/^\uFEFF/, '').split('\r\n')[0]!;
    expect(header).toContain('bankAccountNumber');
    expect(header).not.toContain('nationalId');
  });

  it('gives HR the personal columns too', async () => {
    await hire(app, P, hr, dep);
    const res = await request(app).get('/api/employees/export?format=csv').set(hr);
    expect(res.text).toContain('nationalId');
  });
});
