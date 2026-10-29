import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '@erp/db';
import { parseDateOnly } from '@erp/export';
import { createApp } from '../../app.js';
import { makeActor } from '../../test-utils/access.js';
import { reimburseClaims } from './expense.decisions.js';
import { cleanExpenseData, daysAgo, hireActor, makeDepartment } from './expense.fixtures.js';

const prefix = 'zzexpdecide';
const app = createApp();
let departmentId: string;
let otherDepartmentId: string;
let manager: Awaited<ReturnType<typeof hireActor>>;
let alice: Awaited<ReturnType<typeof hireActor>>;
let outsider: Awaited<ReturnType<typeof hireActor>>;
let approverAll: Awaited<ReturnType<typeof hireActor>>;
let admin: Awaited<ReturnType<typeof hireActor>>;
let config: Awaited<ReturnType<typeof makeActor>>;
let category: string;
const rateIds: string[] = [];

const rate = async (value: number, effectiveFrom: string) => {
  const row = await prisma.exchangeRate.create({ data: { base: 'USD', quote: 'BDT', rate: value, effectiveFrom: parseDateOnly(effectiveFrom), createdBy: config.user.id } });
  rateIds.push(row.id);
};

beforeAll(async () => {
  departmentId = (await makeDepartment(prefix)).id;
  otherDepartmentId = (await makeDepartment(prefix)).id;
  manager = await hireActor(prefix, departmentId, ['expense.approve:team']);
  alice = await hireActor(prefix, departmentId, [], { managerEmployeeId: manager.employee.id });
  outsider = await hireActor(prefix, otherDepartmentId);
  approverAll = await hireActor(prefix, otherDepartmentId, ['expense.approve:all']);
  admin = await hireActor(prefix, otherDepartmentId, [], { admin: true });
  config = await makeActor(prefix, 'STANDARD', ['expense.config']);
  category = (await request(app).post('/api/expenses/categories').set(config.header).send({ code: `${prefix}_FOOD`, name: `${prefix} Food` })).body.id;
  // Effective 70 days ago: it covers a claim dated 5 days ago, not one dated 80 days ago.
  await rate(122.5, daysAgo(70));
  // Effective after the spend date, so it must never be the rate a claim dated 5 days ago is converted at.
  await rate(130, daysAgo(1));
});
afterAll(async () => {
  await prisma.exchangeRate.deleteMany({ where: { id: { in: rateIds } } });
  await cleanExpenseData(prefix, [departmentId, otherDepartmentId]);
});

const file = async (who: { header: object }, over: object = {}) =>
  (await request(app).post('/api/expenses').set(who.header).send({ name: 'Team lunch', amount: 80, categoryId: category, currency: 'BDT', expenseDate: daysAgo(5), ...over })).body;
const approve = (who: { header: object }, id: string, body: object = {}) => request(app).post(`/api/expenses/${id}/approve`).set(who.header).send(body);
const reject = (who: { header: object }, id: string, body: object = { note: 'No receipt' }) => request(app).post(`/api/expenses/${id}/reject`).set(who.header).send(body);
const outbox = (type: string, claimId: string) => prisma.outboxEvent.findFirst({ where: { type, payload: { path: ['claimId'], equals: claimId } } });

describe('approving a claim', () => {
  it('needs expense.approve, and only within the grant’s scope', async () => {
    const made = await file(alice);
    expect((await approve(alice, made.id)).status).toBe(403);
    expect((await approve(outsider, made.id)).status).toBe(403);
    const forOutsider = await file(outsider);
    expect((await approve(manager, forOutsider.id)).status).toBe(403);
    expect((await prisma.expenseClaim.findUniqueOrThrow({ where: { id: made.id } })).status).toBe('PENDING');
    expect((await approve(manager, made.id, { note: 'Fine' })).status).toBe(200);
  });

  it('stamps the decision, audits it, emits the event with the amount and tells the claimant', async () => {
    const made = await file(alice);
    const res = await approve(approverAll, made.id, { note: 'Ok' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'APPROVED', reviewedBy: approverAll.user.id, reviewNote: 'Ok', fxRateToBdt: '1.000000' });
    expect(res.body.reviewedAt).toEqual(expect.any(String));
    expect(await prisma.auditLog.count({ where: { entity: 'EXPENSE_CLAIM', entityId: made.id, action: 'APPROVE' } })).toBe(1);
    const event = await outbox('expense.claim.approved', made.id);
    expect(event?.payload).toMatchObject({ claimId: made.id, employeeId: alice.employee.id, amount: '80.00', currency: 'BDT', amountBdt: '80.00', actorUserId: approverAll.user.id });
    expect(await prisma.notification.count({ where: { userId: alice.user.id, entityId: made.id, type: 'expense.claim.approved' } })).toBe(1);
  });

  it('converts a foreign claim at the rate in force on the spend date, frozen, not at a later one', async () => {
    const made = await file(alice, { currency: 'USD', amount: 80 });
    const res = await approve(approverAll, made.id);
    expect(res.body.fxRateToBdt).toBe('122.500000');
    const event = await outbox('expense.claim.approved', made.id);
    expect(event?.payload).toMatchObject({ currency: 'USD', fxRateToBdt: '122.500000', amountBdt: '9800.00' });
  });

  it('refuses with 409, naming the currency and date, when no rate covers the spend date, and leaves the claim pending', async () => {
    const made = await file(alice, { currency: 'USD', expenseDate: daysAgo(80) });
    const res = await approve(approverAll, made.id);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/USD→BDT/);
    expect((await prisma.expenseClaim.findUniqueOrThrow({ where: { id: made.id } })).status).toBe('PENDING');
    expect(await outbox('expense.claim.approved', made.id)).toBeNull();
  });

  it('lets only an administrator decide their own claim', async () => {
    const mineAsApprover = await file(approverAll);
    expect((await approve(approverAll, mineAsApprover.id)).status).toBe(403);
    const mineAsAdmin = await file(admin);
    const res = await approve(admin, mineAsAdmin.id);
    expect(res.status).toBe(200);
    expect((await outbox('expense.claim.approved', mineAsAdmin.id))?.payload).toMatchObject({ selfDecided: true });
  });

  it('decides once: a second decision is 409 and an unknown claim is 404', async () => {
    const made = await file(alice);
    expect((await approve(approverAll, made.id)).status).toBe(200);
    expect((await approve(approverAll, made.id)).status).toBe(409);
    expect((await reject(approverAll, made.id)).status).toBe(409);
    expect((await approve(approverAll, '00000000-0000-0000-0000-000000000000')).status).toBe(404);
  });
});

describe('rejecting a claim', () => {
  it('needs a note, records it, emits the event and tells the claimant', async () => {
    const made = await file(alice);
    expect((await reject(manager, made.id, {})).status).toBe(400);
    const res = await reject(manager, made.id, { note: 'No receipt' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'REJECTED', reviewNote: 'No receipt', fxRateToBdt: null });
    expect(await outbox('expense.claim.rejected', made.id)).not.toBeNull();
    expect(await prisma.notification.count({ where: { userId: alice.user.id, entityId: made.id, type: 'expense.claim.rejected' } })).toBe(1);
    expect((await reject(outsider, (await file(alice)).id)).status).toBe(403);
  });
});

describe('approving a batch', () => {
  it('approves what it can and names what it could not, never failing the whole sweep', async () => {
    const ok = await file(alice);
    const noRate = await file(alice, { currency: 'USD', expenseDate: daysAgo(80) });
    const done = await file(alice);
    await approve(approverAll, done.id);
    const res = await request(app).post('/api/expenses/batch-approve').set(approverAll.header).send({ claimIds: [ok.id, noRate.id, done.id] });
    expect(res.status).toBe(200);
    expect(res.body.approved).toEqual([ok.id]);
    expect(res.body.failed.map((f: { id: string }) => f.id).sort()).toEqual([noRate.id, done.id].sort());
    expect(res.body.failed.find((f: { id: string }) => f.id === noRate.id).reason).toMatch(/USD→BDT/);
    expect((await request(app).post('/api/expenses/batch-approve').set(alice.header).send({ claimIds: [ok.id] })).status).toBe(403);
    expect((await request(app).post('/api/expenses/batch-approve').set(approverAll.header).send({ claimIds: [] })).status).toBe(400);
  });
});

describe('reimbursing', () => {
  it('is only ever done by the system, for approved claims, and emits the event', async () => {
    const approved = await file(alice);
    await approve(approverAll, approved.id);
    const pending = await file(alice);
    await expect(prisma.$transaction((tx) => reimburseClaims(tx, [approved.id, pending.id], { payslipId: 'payslip-1', actorUserId: approverAll.user.id }))).rejects.toMatchObject({ status: 409 });
    expect((await prisma.expenseClaim.findUniqueOrThrow({ where: { id: approved.id } })).status).toBe('APPROVED');
    await prisma.$transaction((tx) => reimburseClaims(tx, [approved.id], { payslipId: 'payslip-1', actorUserId: approverAll.user.id }));
    expect(await prisma.expenseClaim.findUniqueOrThrow({ where: { id: approved.id } })).toMatchObject({ status: 'REIMBURSED', payslipId: 'payslip-1' });
    expect((await outbox('expense.claim.reimbursed', approved.id))?.payload).toMatchObject({ amount: '80.00', payslipId: 'payslip-1' });
    expect((await approve(approverAll, approved.id)).status).toBe(409);
  });
});
