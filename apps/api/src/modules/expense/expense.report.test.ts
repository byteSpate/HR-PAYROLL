import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '@erp/db';
import { closePdfBrowser } from '@erp/pdf';
import { parseDateOnly } from '@erp/export';
import { createApp } from '../../app.js';
import { makeActor } from '../../test-utils/access.js';
import { cleanExpenseData, daysAgo, hireActor, makeDepartment, makePayslip } from './expense.fixtures.js';

const prefix = 'zzexpreport';
const app = createApp();
let departmentId: string;
let otherDepartmentId: string;
let manager: Awaited<ReturnType<typeof hireActor>>;
let alice: Awaited<ReturnType<typeof hireActor>>;
let bob: Awaited<ReturnType<typeof hireActor>>;
let reporter: Awaited<ReturnType<typeof hireActor>>;
let approver: Awaited<ReturnType<typeof hireActor>>;
let treasurer: Awaited<ReturnType<typeof hireActor>>;
let config: Awaited<ReturnType<typeof makeActor>>;
let category: string;
let rateId: string;

beforeAll(async () => {
  departmentId = (await makeDepartment(prefix)).id;
  otherDepartmentId = (await makeDepartment(prefix)).id;
  manager = await hireActor(prefix, departmentId, ['expense.report:team']);
  alice = await hireActor(prefix, departmentId, [], { managerEmployeeId: manager.employee.id });
  bob = await hireActor(prefix, departmentId);
  reporter = await hireActor(prefix, otherDepartmentId, ['expense.report:all']);
  approver = await hireActor(prefix, otherDepartmentId, ['expense.approve:all']);
  treasurer = await hireActor(prefix, otherDepartmentId, ['expense.manage:all']);
  config = await makeActor(prefix, 'STANDARD', ['expense.config']);
  category = (await request(app).post('/api/expenses/categories').set(config.header).send({ code: `${prefix}_FOOD`, name: `${prefix} Food` })).body.id;
  rateId = (await prisma.exchangeRate.create({ data: { base: 'USD', quote: 'BDT', rate: 122.5, effectiveFrom: parseDateOnly(daysAgo(80)), createdBy: config.user.id } })).id;
});
afterAll(async () => {
  await closePdfBrowser();
  await prisma.exchangeRate.deleteMany({ where: { id: rateId } });
  await prisma.auditLog.deleteMany({ where: { entity: 'EXPENSE_REPORT', changedBy: { in: [alice.user.id, reporter.user.id, manager.user.id] } } });
  await cleanExpenseData(prefix, [departmentId, otherDepartmentId]);
});

const file = async (who: { header: object }, over: object = {}) =>
  (await request(app).post('/api/expenses').set(who.header).send({ name: 'Lunch', amount: 33.33, categoryId: category, currency: 'BDT', expenseDate: daysAgo(10), ...over })).body;
const report = (who: { header: object }, query: object = {}) => request(app).get('/api/expenses/report').query({ from: daysAgo(30), to: daysAgo(0), ...query }).set(who.header);

describe('the expense report', () => {
  it('adds money exactly: three claims of 33.33 total 99.99', async () => {
    await Promise.all([file(alice), file(alice), file(alice)]);
    const res = await report(alice);
    expect(res.status).toBe(200);
    expect(res.body.totals.byCurrency).toEqual([{ currency: 'BDT', claims: 3, amount: '99.99' }]);
    expect(res.body.totals.byStatus).toEqual([{ status: 'PENDING', claims: 3, byCurrency: [{ currency: 'BDT', amount: '99.99' }] }]);
  });

  it('ranges on the spend date, inclusive at both ends, not on the day it was filed', async () => {
    const edge = await file(bob, { expenseDate: daysAgo(20), name: 'On the first day' });
    const outside = await file(bob, { expenseDate: daysAgo(40), name: 'Before the range' });
    const res = await report(bob, { from: daysAgo(20), to: daysAgo(10) });
    const ids = res.body.rows.map((r: { id: string }) => r.id);
    expect(ids).toContain(edge.id);
    expect(ids).not.toContain(outside.id);
    expect(res.body.rows[0].expenseDate <= res.body.rows[res.body.rows.length - 1].expenseDate).toBe(true);
  });

  it('is about the caller alone unless they hold expense.report, and a stranger’s id is refused', async () => {
    const hers = await file(alice, { name: 'Alice only' });
    const mine = await report(bob);
    expect(mine.body.rows.every((r: { employee: { id: string } }) => r.employee.id === bob.employee.id)).toBe(true);
    expect(mine.body.employee).toMatchObject({ id: bob.employee.id });
    expect((await report(bob, { employeeId: alice.employee.id })).status).toBe(403);
    expect((await report(bob, { employeeId: bob.employee.id })).status).toBe(200);
    const team = await report(manager);
    const teamIds = team.body.rows.map((r: { id: string }) => r.id);
    expect(teamIds).toContain(hers.id);
    expect(team.body.rows.every((r: { employee: { id: string } }) => [alice.employee.id, manager.employee.id].includes(r.employee.id))).toBe(true);
    expect((await report(manager, { employeeId: bob.employee.id })).status).toBe(403);
    const everyone = await report(reporter);
    expect(everyone.body.rows.map((r: { employee: { id: string } }) => r.employee.id)).toEqual(expect.arrayContaining([alice.employee.id, bob.employee.id]));
    expect(everyone.body.employee).toBeNull();
  });

  it('keeps currencies apart and shows the frozen rate and BDT amount only for an approved foreign claim', async () => {
    const usd = await file(alice, { currency: 'USD', amount: 10, name: 'Conference fee' });
    const pending = await file(alice, { currency: 'USD', amount: 5, name: 'Pending fee' });
    await request(app).post(`/api/expenses/${usd.id}/approve`).set(approver.header).send({});
    const res = await report(reporter, { employeeId: alice.employee.id });
    const row = res.body.rows.find((r: { id: string }) => r.id === usd.id);
    expect(row).toMatchObject({ currency: 'USD', amount: '10.00', fxRateToBdt: '122.500000', amountBdt: '1225.00', status: 'APPROVED' });
    expect(res.body.rows.find((r: { id: string }) => r.id === pending.id)).toMatchObject({ fxRateToBdt: null, amountBdt: null });
    expect(res.body.totals.byCurrency.map((c: { currency: string }) => c.currency)).toEqual(['BDT', 'USD']);
    const narrowed = await report(reporter, { status: 'APPROVED' });
    expect(narrowed.body.rows.every((r: { status: string }) => r.status === 'APPROVED')).toBe(true);
  });

  it('works for an administrator with no employee record of their own', async () => {
    const owner = await makeActor(prefix, 'ADMIN');
    const res = await report(owner);
    expect(res.status).toBe(200);
    expect(res.body.employee).toBeNull();
    expect(res.body.rows.length).toBeGreaterThan(0);
  });

  it('counts the receipts behind each claim', async () => {
    const made = await file(alice, { name: 'No receipt yet' });
    const res = await report(alice);
    expect(res.body.rows.find((r: { id: string }) => r.id === made.id).receipts).toBe(0);
  });

  it('refuses a missing, backwards or oversized range', async () => {
    expect((await request(app).get('/api/expenses/report').set(alice.header)).status).toBe(400);
    expect((await report(alice, { from: daysAgo(1), to: daysAgo(5) })).status).toBe(400);
    expect((await report(alice, { from: '2020-01-01', to: daysAgo(0) })).status).toBe(400);
    expect((await request(app).get('/api/expenses/report').query({ from: daysAgo(30), to: daysAgo(0) })).status).toBe(401);
  });

  it('downloads as CSV with a byte order mark and records one export audit row', async () => {
    const before = await prisma.auditLog.count({ where: { entity: 'EXPENSE_REPORT', action: 'EXPORT', changedBy: alice.user.id } });
    const res = await report(alice, { format: 'csv' });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toMatch(/expenses-.*\.csv/);
    expect(res.text.startsWith('﻿Date,EmployeeCode,Employee,Expense')).toBe(true);
    expect(await prisma.auditLog.count({ where: { entity: 'EXPENSE_REPORT', action: 'EXPORT', changedBy: alice.user.id } })).toBe(before + 1);
  });
});

describe('the expense report as a PDF', () => {
  it('answers application/pdf and records one export audit row', async () => {
    const before = await prisma.auditLog.count({ where: { entity: 'EXPENSE_REPORT', action: 'EXPORT', changedBy: alice.user.id } });
    const res = await report(alice, { format: 'pdf' }).buffer(true).parse((r, done) => {
      const chunks: Buffer[] = [];
      r.on('data', (c: Buffer) => chunks.push(c));
      r.on('end', () => done(null, Buffer.concat(chunks)));
    });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toMatch(/expenses-.*\.pdf/);
    expect((res.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
    expect(await prisma.auditLog.count({ where: { entity: 'EXPENSE_REPORT', action: 'EXPORT', changedBy: alice.user.id } })).toBe(before + 1);
  }, 60_000);
});

describe('what is still owed in reimbursements', () => {
  it('needs expense.manage and lists approved claims no payment has taken, per currency, oldest first', async () => {
    const owed = await file(alice, { amount: 40, name: 'Owed taxi' });
    await request(app).post(`/api/expenses/${owed.id}/approve`).set(approver.header).send({});
    const paid = await file(alice, { amount: 15, name: 'Already paid' });
    await request(app).post(`/api/expenses/${paid.id}/approve`).set(approver.header).send({});
    await prisma.expenseClaim.update({ where: { id: paid.id }, data: { status: 'REIMBURSED', payslipId: (await makePayslip(paid.employeeId)).id } });
    expect((await request(app).get('/api/expenses/outstanding-reimbursements').set(alice.header)).status).toBe(403);
    const res = await request(app).get('/api/expenses/outstanding-reimbursements').set(treasurer.header);
    expect(res.status).toBe(200);
    const ids = res.body.rows.map((r: { id: string }) => r.id);
    expect(ids).toContain(owed.id);
    expect(ids).not.toContain(paid.id);
    const row = res.body.rows.find((r: { id: string }) => r.id === owed.id);
    expect(row).toMatchObject({ amount: '40.00', currency: 'BDT', ageDays: 0, name: 'Owed taxi' });
    expect(res.body.totals.claims).toBe(res.body.rows.length);
    expect(res.body.totals.byCurrency[0]).toMatchObject({ currency: 'BDT' });
  });
});
