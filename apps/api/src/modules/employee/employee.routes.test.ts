import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '@erp/db';
import { createApp } from '../../app.js';
import { bearer, cleanActors, makeActor } from '../../test-utils/access.js';

const app = createApp();
const P = 'zztest9e';
let depA: string;
let depB: string;
let hr: { Authorization: string };
let finance: { Authorization: string };

async function removeEmployees() {
  const emps = await prisma.employee.findMany({ where: { user: { email: { startsWith: P } } }, select: { id: true, userId: true } });
  await prisma.employee.updateMany({ where: { id: { in: emps.map((e) => e.id) } }, data: { reportingManagerId: null } });
  await prisma.employee.deleteMany({ where: { id: { in: emps.map((e) => e.id) } } });
  await prisma.auditLog.deleteMany({ where: { entityId: { in: [...emps.map((e) => e.id), ...emps.map((e) => e.userId)] } } });
  await prisma.outboxEvent.deleteMany({ where: { type: { startsWith: 'employee.' } } });
  // Only the hired employees' own logins: the actor accounts share the prefix and outlive each test.
  await prisma.user.deleteMany({ where: { id: { in: emps.map((e) => e.userId) } } });
}

beforeAll(async () => {
  await removeEmployees();
  await prisma.department.deleteMany({ where: { name: { startsWith: P } } });
  depA = (await prisma.department.create({ data: { name: `${P} A` } })).id;
  depB = (await prisma.department.create({ data: { name: `${P} B` } })).id;
  hr = (await makeActor(P, 'STANDARD', ['employee.create', 'employee.read:all', 'employee.update:all'])).header;
  finance = (await makeActor(P, 'STANDARD', ['employee.read.financial'])).header;
});

afterEach(removeEmployees);

afterAll(async () => {
  await cleanActors(P);
  await prisma.department.deleteMany({ where: { name: { startsWith: P } } });
});

let seq = 0;
async function hire(over: Record<string, unknown> = {}) {
  seq += 1;
  const res = await request(app)
    .post('/api/employees')
    .set(hr)
    .send({
      email: `${P}-${Date.now()}-${seq}@example.com`,
      fullName: `Person ${seq}`,
      designation: 'Engineer',
      departmentId: depA,
      employmentType: 'FULL_TIME',
      joiningDate: '2026-01-05',
      ...over,
    });
  expect(res.status).toBe(201);
  const emp = await prisma.employee.findUniqueOrThrow({ where: { id: res.body.employee.id } });
  return { id: emp.id, userId: emp.userId, as: bearer(emp.userId, 'STANDARD', []), body: res.body };
}

describe('POST /api/employees', () => {
  it('creates the login and the employee together and returns a one-time password', async () => {
    const { body, userId } = await hire();
    expect(body.temporaryPassword.length).toBeGreaterThanOrEqual(12);
    expect(body.employee.employeeCode).toMatch(/^EMP-\d{4}$/);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user).toMatchObject({ accessLevel: 'STANDARD', mustChangePassword: true });
    expect(await prisma.outboxEvent.count({ where: { type: 'employee.joined' } })).toBe(1);
  });

  it('refuses a duplicate email with 409 and an unknown department with 400', async () => {
    const { body } = await hire();
    const dup = await request(app).post('/api/employees').set(hr).send({
      email: body.employee.work.email,
      fullName: 'X',
      designation: 'Y',
      departmentId: depA,
      employmentType: 'FULL_TIME',
      joiningDate: '2026-01-05',
    });
    expect(dup.status).toBe(409);
    const bad = await request(app).post('/api/employees').set(hr).send({
      email: `${P}-nodept@example.com`,
      fullName: 'X',
      designation: 'Y',
      departmentId: 'missing',
      employmentType: 'FULL_TIME',
      joiningDate: '2026-01-05',
    });
    expect(bad.status).toBe(400);
  });

  it('requires employee.create', async () => {
    const res = await request(app).post('/api/employees').set(finance).send({});
    expect(res.status).toBe(403);
  });
});

describe('reading employees', () => {
  it('hides personal, money and employment keys from a colleague', async () => {
    const a = await hire();
    const b = await hire();
    const res = await request(app).get(`/api/employees/${b.id}`).set(a.as);
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(['editableFields', 'employeeCode', 'id', 'work']);
  });

  it('shows finance the bank details but not personal details', async () => {
    const a = await hire();
    await request(app).patch(`/api/employees/${a.id}`).set(hr).send({ bankAccountNumber: '12345' });
    const res = await request(app).get(`/api/employees/${a.id}`).set(finance);
    expect(res.body.money.bankAccountNumber).toBe('12345');
    expect(res.body.personal).toBeUndefined();
  });

  it('returns the own record from /me and 404 for an account with no employee record', async () => {
    const a = await hire();
    const me = await request(app).get('/api/employees/me').set(a.as);
    expect(me.body.id).toBe(a.id);
    expect(me.body.personal).toBeDefined();
    expect((await request(app).get('/api/employees/me').set(hr)).status).toBe(404);
  });

  it('lists only the viewer department for a department-scoped reader', async () => {
    const inA = await hire();
    const inB = await hire({ departmentId: depB });
    const reader = await makeActor(P, 'STANDARD', ['employee.read:department']);
    await prisma.employee.create({
      data: {
        userId: reader.user.id,
        employeeCode: `${P}-R`,
        fullName: 'Reader',
        designation: 'HR',
        departmentId: depA,
        employmentType: 'FULL_TIME',
        joiningDate: new Date('2026-01-01'),
      },
    });
    const res = await request(app).get('/api/employees').set(reader.header);
    const ids = res.body.map((e: { id: string }) => e.id);
    expect(ids).toContain(inA.id);
    expect(ids).not.toContain(inB.id);
    await prisma.employee.deleteMany({ where: { userId: reader.user.id } });
  });

  it('lists active colleagues in the directory at the colleague tier', async () => {
    const a = await hire();
    const res = await request(app).get(`/api/employees/directory?q=${encodeURIComponent(a.body.employee.work.fullName)}`).set(a.as);
    expect(res.status).toBe(200);
    expect(res.body[0].personal).toBeUndefined();
  });
});

describe('PATCH /api/employees/:id', () => {
  it('lets an employee edit their phone but not bank details, designation or national id', async () => {
    const a = await hire();
    expect((await request(app).patch(`/api/employees/${a.id}`).set(a.as).send({ phone: '01700' })).status).toBe(200);
    for (const field of ['bankAccountNumber', 'designation', 'nationalId']) {
      const res = await request(app).patch(`/api/employees/${a.id}`).set(a.as).send({ [field]: 'x' });
      expect(res.status).toBe(403);
      expect(res.body.error).toBe(`Field not editable: ${field}`);
    }
    const row = await prisma.employee.findUniqueOrThrow({ where: { id: a.id } });
    expect(row).toMatchObject({ phone: '01700', bankAccountNumber: null, designation: 'Engineer', nationalId: null });
  });

  it('refuses a reporting line that would form a cycle, or self-management', async () => {
    const a = await hire();
    const b = await hire({ reportingManagerId: a.id });
    const c = await hire({ reportingManagerId: b.id });
    expect((await request(app).patch(`/api/employees/${a.id}`).set(hr).send({ reportingManagerId: c.id })).status).toBe(409);
    expect((await request(app).patch(`/api/employees/${a.id}`).set(hr).send({ reportingManagerId: a.id })).status).toBe(409);
  });

  it('emits employee.bank_changed and audits only the changed fields', async () => {
    const a = await hire();
    await request(app).patch(`/api/employees/${a.id}`).set(hr).send({ bankName: 'City', designation: 'Engineer' });
    expect(await prisma.outboxEvent.count({ where: { type: 'employee.bank_changed' } })).toBe(1);
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { entity: 'EMPLOYEE', entityId: a.id, action: 'UPDATE' } });
    expect(audit.after).toEqual({ bankName: 'City' });
  });

  it('refuses another employee record to a plain colleague', async () => {
    const a = await hire();
    const b = await hire();
    expect((await request(app).patch(`/api/employees/${b.id}`).set(a.as).send({ phone: '1' })).status).toBe(403);
  });
});

describe('departments with employees', () => {
  it('cannot be deleted', async () => {
    await hire();
    const manager = await makeActor(P, 'STANDARD', ['department.manage']);
    const res = await request(app).delete(`/api/departments/${depA}`).set(manager.header);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Department has employees');
  });
});
