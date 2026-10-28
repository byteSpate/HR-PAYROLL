import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '@erp/db';
import { createApp } from '../../app.js';
import { bearer, cleanActors, makeActor } from '../../test-utils/access.js';
import { hire, removeEmployees } from './employee.fixtures.js';

const app = createApp();
const P = 'zztest10c';
let dep: string;
let hr: { Authorization: string };

beforeAll(async () => {
  await removeEmployees(P);
  await prisma.department.deleteMany({ where: { name: { startsWith: P } } });
  dep = (await prisma.department.create({ data: { name: `${P} Dept` } })).id;
  hr = (
    await makeActor(P, 'STANDARD', ['employee.create', 'employee.read:all', 'employee.update:all', 'employee.id_request.decide:all'])
  ).header;
});
afterEach(async () => {
  await prisma.employeeChangeRequest.deleteMany({ where: { employee: { user: { email: { startsWith: P } } } } });
  await removeEmployees(P);
});
afterAll(async () => {
  await cleanActors(P);
  await prisma.department.deleteMany({ where: { name: { startsWith: P } } });
});

const ask = (as: { Authorization: string }, newValue = '1990123456789') =>
  request(app).post('/api/employees/national-id-requests').set(as).send({ newValue });

describe('national ID change requests', () => {
  it('lets an employee ask, and HR approve, which writes the new national ID', async () => {
    const e = await hire(app, P, hr, dep);
    const asked = await ask(e.as);
    expect(asked.status).toBe(201);
    expect(await prisma.outboxEvent.count({ where: { type: 'employee.national_id_change_requested' } })).toBe(1);

    const list = await request(app).get('/api/employees/national-id-requests?status=PENDING').set(hr);
    expect(list.body.map((r: { id: string }) => r.id)).toContain(asked.body.id);

    const decided = await request(app)
      .patch(`/api/employees/national-id-requests/${asked.body.id}/decide`)
      .set(hr)
      .send({ approve: true });
    expect(decided.status).toBe(200);
    expect((await prisma.employee.findUniqueOrThrow({ where: { id: e.id } })).nationalId).toBe('1990123456789');
  });

  it('allows one pending request at a time', async () => {
    const e = await hire(app, P, hr, dep);
    await ask(e.as);
    expect((await ask(e.as, '222')).status).toBe(409);
  });

  it('lets the owner cancel a pending request but not someone else', async () => {
    const a = await hire(app, P, hr, dep);
    const b = await hire(app, P, hr, dep);
    const asked = await ask(a.as);
    expect((await request(app).patch(`/api/employees/national-id-requests/${asked.body.id}/cancel`).set(b.as)).status).toBe(403);
    expect((await request(app).patch(`/api/employees/national-id-requests/${asked.body.id}/cancel`).set(a.as)).status).toBe(200);
    const again = await request(app).patch(`/api/employees/national-id-requests/${asked.body.id}/cancel`).set(a.as);
    expect(again.status).toBe(409);
  });

  it('never lets someone decide their own request', async () => {
    const e = await hire(app, P, hr, dep);
    const decider = await makeActor(P, 'STANDARD', ['employee.id_request.decide:all']);
    await prisma.employee.update({ where: { id: e.id }, data: { userId: decider.user.id } });
    await prisma.user.delete({ where: { id: e.userId } });
    const asked = await ask(decider.header);
    const res = await request(app)
      .patch(`/api/employees/national-id-requests/${asked.body.id}/decide`)
      .set(decider.header)
      .send({ approve: true });
    expect(res.status).toBe(403);
    await prisma.employeeChangeRequest.deleteMany({ where: { employeeId: e.id } });
    await prisma.employee.delete({ where: { id: e.id } });
  });

  it('refuses a decider whose department scope does not reach the employee', async () => {
    const e = await hire(app, P, hr, dep);
    const asked = await ask(e.as);
    const outsider = await makeActor(P, 'STANDARD', ['employee.id_request.decide:department']);
    const res = await request(app)
      .patch(`/api/employees/national-id-requests/${asked.body.id}/decide`)
      .set(outsider.header)
      .send({ approve: false });
    expect(res.status).toBe(403);
  });

  it('needs an employee record to ask', async () => {
    expect((await ask(bearer('no-employee', 'STANDARD', []))).status).toBe(404);
  });
});
