import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '@erp/db';
import { createApp } from '../../app.js';
import { makeActor } from '../../test-utils/access.js';
import { cleanExpenseData, daysAgo, hireActor, makeDepartment } from './expense.fixtures.js';

const prefix = 'zzexpclaims';
const app = createApp();
let departmentId: string;
let otherDepartmentId: string;
let manager: Awaited<ReturnType<typeof hireActor>>;
let alice: Awaited<ReturnType<typeof hireActor>>;
let bob: Awaited<ReturnType<typeof hireActor>>;
let outsider: Awaited<ReturnType<typeof hireActor>>;
let finance: Awaited<ReturnType<typeof hireActor>>;
let config: Awaited<ReturnType<typeof makeActor>>;
let plain: Awaited<ReturnType<typeof hireActor>>;
let travel: string;
let stationery: string;

beforeAll(async () => {
  departmentId = (await makeDepartment(prefix)).id;
  otherDepartmentId = (await makeDepartment(prefix)).id;
  manager = await hireActor(prefix, departmentId, ['expense.read:team']);
  alice = await hireActor(prefix, departmentId, [], { managerEmployeeId: manager.employee.id });
  bob = await hireActor(prefix, departmentId);
  outsider = await hireActor(prefix, otherDepartmentId);
  plain = await hireActor(prefix, otherDepartmentId);
  finance = await hireActor(prefix, otherDepartmentId, ['expense.read:all']);
  config = await makeActor(prefix, 'STANDARD', ['expense.config']);
  const make = (code: string, name: string) => request(app).post('/api/expenses/categories').set(config.header).send({ code, name });
  // The route rule keys on the exact code TRAVEL, so this one cannot carry the test prefix.
  travel = (await make('TRAVEL', `${prefix} Travel`)).body.id;
  stationery = (await make(`${prefix}_STATIONERY`, `${prefix} Stationery`)).body.id;
});
afterAll(async () => {
  await cleanExpenseData(prefix, [departmentId, otherDepartmentId], [travel]);
});

const claim = (over: object = {}) => ({ name: 'Taxi to Motijheel', amount: 450, categoryId: stationery, currency: 'BDT', expenseDate: daysAgo(2), ...over });
const file = (who: { header: object }, body: object = claim()) => request(app).post('/api/expenses').set(who.header).send(body);

describe('expense categories', () => {
  it('lets any signed-in person list them, but only expense.config create, rename or delete', async () => {
    expect((await request(app).get('/api/expenses/categories')).status).toBe(401);
    expect((await request(app).get('/api/expenses/categories').set(plain.header)).status).toBe(200);
    expect((await request(app).post('/api/expenses/categories').set(plain.header).send({ code: 'X', name: 'X' })).status).toBe(403);
    const made = await request(app).post('/api/expenses/categories').set(config.header).send({ code: `${prefix}_misc`, name: `${prefix} Misc` });
    expect(made.status).toBe(201);
    expect(made.body.code).toBe(`${prefix.toUpperCase()}_MISC`);
    expect((await request(app).post('/api/expenses/categories').set(config.header).send({ code: `${prefix}_misc`, name: `${prefix} Other` })).status).toBe(409);
    expect((await request(app).patch(`/api/expenses/categories/${made.body.id}`).set(config.header).send({ name: `${prefix} Sundry` })).body.name).toBe(`${prefix} Sundry`);
    expect((await request(app).delete(`/api/expenses/categories/${made.body.id}`).set(config.header)).status).toBe(204);
  });

  it('refuses to delete a category claims still use', async () => {
    await file(alice);
    const res = await request(app).delete(`/api/expenses/categories/${stationery}`).set(config.header);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/used by \d+ claim/);
  });
});

describe('filing a claim', () => {
  it('needs only an employee record, starts PENDING and carries the claimant', async () => {
    expect((await request(app).post('/api/expenses').send(claim())).status).toBe(401);
    const res = await file(alice);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Taxi to Motijheel', amount: '450.00', currency: 'BDT', status: 'PENDING', employeeId: alice.employee.id, travelFrom: null, fxRateToBdt: null });
    expect(res.body.category.name).toBe(`${prefix} Stationery`);
  });

  it('refuses an account with no employee record, a future date, an old date, a bad category and a non-positive amount', async () => {
    const noEmployee = await makeActor(prefix, 'STANDARD');
    expect((await file(noEmployee)).status).toBe(403);
    expect((await file(alice, claim({ expenseDate: daysAgo(-1) }))).status).toBe(400);
    expect((await file(alice, claim({ expenseDate: daysAgo(91) }))).status).toBe(400);
    expect((await file(alice, claim({ categoryId: '00000000-0000-0000-0000-000000000000' }))).status).toBe(400);
    expect((await file(alice, claim({ amount: 0 }))).status).toBe(400);
    expect((await file(alice, claim({ name: '  ' }))).status).toBe(400);
  });

  it('keeps From and To only for a category that has a route', async () => {
    const trip = await file(alice, claim({ categoryId: travel, travelFrom: 'Gulshan 1', travelTo: 'Motijheel' }));
    expect(trip.body).toMatchObject({ travelFrom: 'Gulshan 1', travelTo: 'Motijheel' });
    const bill = await file(alice, claim({ travelFrom: 'Gulshan 1', travelTo: 'Motijheel' }));
    expect(bill.body).toMatchObject({ travelFrom: null, travelTo: null });
  });

  it('stores an amount exactly, never as a float', async () => {
    expect((await file(alice, claim({ amount: 33.33 }))).body.amount).toBe('33.33');
  });
});

describe('seeing claims', () => {
  it('lists a person’s own claims at /me and nobody else’s', async () => {
    const mine = await file(bob, claim({ name: 'Bob only' }));
    const res = await request(app).get('/api/expenses/me').set(bob.header);
    expect(res.status).toBe(200);
    expect(res.body.map((c: { id: string }) => c.id)).toContain(mine.body.id);
    expect(res.body.every((c: { employeeId: string }) => c.employeeId === bob.employee.id)).toBe(true);
  });

  it('shows the whole list only to expense.read, narrowed to the grant’s scope', async () => {
    const hers = await file(alice, claim({ name: 'Alice report line' }));
    const his = await file(bob, claim({ name: 'Bob not a report' }));
    expect((await request(app).get('/api/expenses').set(alice.header)).status).toBe(403);
    const team = await request(app).get('/api/expenses').set(manager.header);
    const teamIds = team.body.map((c: { id: string }) => c.id);
    expect(teamIds).toContain(hers.body.id);
    expect(teamIds).not.toContain(his.body.id);
    const everyone = await request(app).get('/api/expenses').set(finance.header);
    expect(everyone.body.map((c: { id: string }) => c.id)).toEqual(expect.arrayContaining([hers.body.id, his.body.id]));
    const none = await request(app).get('/api/expenses').query({ status: 'REJECTED', employeeId: alice.employee.id }).set(finance.header);
    expect(none.body).toEqual([]);
  });

  it('answers 404, not 403, for a claim outside the viewer’s scope, so existence is not confirmed', async () => {
    const hers = await file(alice);
    expect((await request(app).get(`/api/expenses/${hers.body.id}`).set(alice.header)).status).toBe(200);
    expect((await request(app).get(`/api/expenses/${hers.body.id}`).set(manager.header)).status).toBe(200);
    expect((await request(app).get(`/api/expenses/${hers.body.id}`).set(finance.header)).status).toBe(200);
    expect((await request(app).get(`/api/expenses/${hers.body.id}`).set(bob.header)).status).toBe(404);
    expect((await request(app).get(`/api/expenses/${hers.body.id}`).set(outsider.header)).status).toBe(404);
    expect((await request(app).get('/api/expenses/00000000-0000-0000-0000-000000000000').set(finance.header)).status).toBe(404);
  });
});

describe('amending and withdrawing', () => {
  it('lets the owner change a pending claim, re-applying the date rules', async () => {
    const made = await file(alice, claim({ categoryId: travel, travelFrom: 'A', travelTo: 'B' }));
    const edited = await request(app).patch(`/api/expenses/${made.body.id}`).set(alice.header).send({ amount: 500, description: 'Receipt lost' });
    expect(edited.status).toBe(200);
    expect(edited.body).toMatchObject({ amount: '500.00', description: 'Receipt lost', travelFrom: 'A' });
    expect((await request(app).patch(`/api/expenses/${made.body.id}`).set(alice.header).send({ description: null })).body.description).toBeNull();
    expect((await request(app).patch(`/api/expenses/${made.body.id}`).set(alice.header).send({ expenseDate: daysAgo(120) })).status).toBe(400);
    expect((await request(app).patch(`/api/expenses/${made.body.id}`).set(alice.header).send({})).status).toBe(400);
    const moved = await request(app).patch(`/api/expenses/${made.body.id}`).set(alice.header).send({ categoryId: stationery });
    expect(moved.body).toMatchObject({ travelFrom: null, travelTo: null });
  });

  it('is the owner’s alone, and only while pending', async () => {
    const made = await file(alice);
    expect((await request(app).patch(`/api/expenses/${made.body.id}`).set(bob.header).send({ amount: 1 })).status).toBe(404);
    expect((await request(app).delete(`/api/expenses/${made.body.id}`).set(finance.header)).status).toBe(404);
    await prisma.expenseClaim.update({ where: { id: made.body.id }, data: { status: 'APPROVED' } });
    expect((await request(app).patch(`/api/expenses/${made.body.id}`).set(alice.header).send({ amount: 1 })).status).toBe(409);
    expect((await request(app).delete(`/api/expenses/${made.body.id}`).set(alice.header)).status).toBe(409);
  });

  it('withdraws a pending claim for good, leaving an audit row', async () => {
    const made = await file(alice);
    expect((await request(app).delete(`/api/expenses/${made.body.id}`).set(alice.header)).status).toBe(204);
    expect((await request(app).get(`/api/expenses/${made.body.id}`).set(finance.header)).status).toBe(404);
    expect(await prisma.auditLog.count({ where: { entity: 'EXPENSE_CLAIM', entityId: made.body.id, action: 'DELETE' } })).toBe(1);
  });
});
