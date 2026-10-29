import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '@erp/db';
import { createApp } from '../../app.js';
import { makeActor } from '../../test-utils/access.js';
import {
  cleanPayrollData,
  hireActor,
  makeDepartment,
  makeStructure,
} from '../payroll/payroll.fixtures.js';

const prefix = 'zzsettle';
const app = createApp();
let departmentId: string;
let otherDepartmentId: string;
let config: Awaited<ReturnType<typeof makeActor>>;
let finance: Awaited<ReturnType<typeof makeActor>>;
let admin: Awaited<ReturnType<typeof makeActor>>;
let hr: Awaited<ReturnType<typeof hireActor>>;
let deptReader: Awaited<ReturnType<typeof hireActor>>;
let alice: Awaited<ReturnType<typeof hireActor>>;
let categoryId: string;

const post = (path: string, who: { header: Record<string, string> }, body: object = {}) =>
  request(app).post(`/api/settlements${path}`).set(who.header).send(body);
const exit = (who: { header: Record<string, string> }, body: object) =>
  request(app).patch(`/api/employees/${alice.employee.id}/exit`).set(who.header).send(body);

async function reset() {
  await prisma.expenseClaim.updateMany({
    where: { employeeId: alice.employee.id },
    data: { settlementId: null },
  });
  await prisma.settlement.deleteMany({ where: { employeeId: alice.employee.id } });
  await prisma.expenseClaim.deleteMany({ where: { employeeId: alice.employee.id } });
  await prisma.employee.update({
    where: { id: alice.employee.id },
    data: { lastWorkingDay: null, exitReason: null, exitNote: null, employmentStatus: 'ACTIVE' },
  });
  await prisma.user.update({ where: { id: alice.user.id }, data: { isActive: true } });
}

beforeAll(async () => {
  departmentId = (await makeDepartment(prefix)).id;
  otherDepartmentId = (await makeDepartment(prefix)).id;
  config = await makeActor(prefix, 'STANDARD', ['payroll.config']);
  finance = await makeActor(prefix, 'STANDARD', [
    'settlement.read:all',
    'settlement.create:all',
    'settlement.pay:all',
    'settlement.approve:all',
  ]);
  admin = await makeActor(prefix, 'ADMIN');
  hr = await hireActor(prefix, otherDepartmentId, [
    'employee.read:all',
    'employee.update:all',
    'employee.exit:all',
  ]);
  deptReader = await hireActor(prefix, otherDepartmentId, ['settlement.read:department']);
  alice = await hireActor(prefix, departmentId);
  const structure = await makeStructure(app, config.header, prefix);
  await prisma.employee.update({
    where: { id: alice.employee.id },
    data: { salaryStructureId: structure.id, joiningDate: new Date('2020-01-01T00:00:00Z') },
  });
  categoryId = (
    await prisma.expenseCategory.create({
      data: { code: `${prefix.toUpperCase()}_X`, name: `${prefix} cat` },
    })
  ).id;
});
afterEach(reset);
afterAll(async () => {
  await reset();
  await cleanPayrollData(prefix, [departmentId, otherDepartmentId], []);
});

describe('final settlement', () => {
  it('needs exit details and a salary structure before it can be calculated', async () => {
    expect((await post(`/${alice.employee.id}/calculate`, finance)).status).toBe(409);
    expect((await post(`/${alice.employee.id}/calculate`, hr)).status).toBe(403);
  });

  it('adds its heads to the final amount to the cent, sweeping the approved claims once', async () => {
    await prisma.expenseClaim.createMany({
      data: [1, 2, 3].map((n) => ({
        employeeId: alice.employee.id,
        name: `Lunch ${n}`,
        amount: '33.33',
        categoryId,
        currency: 'BDT',
        expenseDate: new Date('2026-01-10T00:00:00Z'),
        status: 'APPROVED' as const,
        fxRateToBdt: '1',
      })),
    });
    expect(
      (await exit(hr, { lastWorkingDay: '2026-01-20', exitReason: 'RESIGNATION' })).status,
    ).toBe(200);
    const res = await post(`/${alice.employee.id}/calculate`, finance);
    expect(res.status).toBe(201);
    const s = res.body;
    expect(s.settlementNo).toMatch(/^BS-STL-\d{5,}$/);
    expect(s.expenseReimbursement).toBe('99.99');
    const heads = [
      'pendingSalary',
      'gratuity',
      'noticePay',
      'expenseReimbursement',
      'leaveEncashment',
    ].reduce((a, k) => a + Number(s[k]), 0);
    expect(Number(s.finalAmount)).toBeCloseTo(
      heads - Number(s.outstandingDeductions) - Number(s.assetRecoveries),
      2,
    );
    expect(await prisma.expenseClaim.count({ where: { settlementId: s.id } })).toBe(3);

    // A second calculation rebuilds the draft instead of stacking another.
    const again = await post(`/${alice.employee.id}/calculate`, finance);
    expect(again.status).toBe(201);
    expect(await prisma.settlement.count({ where: { employeeId: alice.employee.id } })).toBe(1);
  });

  it('can be overridden only with a reason, while a draft', async () => {
    await exit(hr, { lastWorkingDay: '2026-01-20', exitReason: 'RESIGNATION' });
    const s = (await post(`/${alice.employee.id}/calculate`, finance)).body;
    const patch = (body: object) =>
      request(app).patch(`/api/settlements/id/${s.id}`).set(finance.header).send(body);
    expect((await patch({ gratuity: '1' })).status).toBe(400);
    const res = await patch({ gratuity: '1000.50', reason: 'Agreed with the employee' });
    expect(res.status).toBe(200);
    expect(Number(res.body.gratuity)).toBe(1000.5);
  });

  it('freezes exit details once approved, and a draft’s approver cannot be its calculator', async () => {
    await exit(hr, { lastWorkingDay: '2026-01-20', exitReason: 'RESIGNATION' });
    const s = (await post(`/${alice.employee.id}/calculate`, finance)).body;
    expect((await post(`/id/${s.id}/reject`, admin, {})).status).toBe(400);
    expect((await post(`/id/${s.id}/approve`, finance)).status).toBe(403);
    expect((await post(`/id/${s.id}/approve`, admin)).status).toBe(200);
    const edit = await exit(hr, { lastWorkingDay: '2026-01-25', exitReason: 'RESIGNATION' });
    expect(edit.status).toBe(409);
    expect(edit.body.error).toMatch(/frozen/);
    expect((await post(`/${alice.employee.id}/calculate`, finance)).status).toBe(409);
    const event = await prisma.outboxEvent.findFirst({
      where: { type: 'settlement.approved', payload: { path: ['settlementId'], equals: s.id } },
    });
    expect(Number((event?.payload as { finalAmount: string }).finalAmount)).toBeCloseTo(Number(s.finalAmount), 2);
  });

  it('pays once, reimbursing its claims and mailing the statement', async () => {
    const claim = await prisma.expenseClaim.create({
      data: {
        employeeId: alice.employee.id,
        name: 'Taxi',
        amount: '50',
        categoryId,
        currency: 'BDT',
        expenseDate: new Date('2026-01-12T00:00:00Z'),
        status: 'APPROVED',
        fxRateToBdt: '1',
      },
    });
    await exit(hr, { lastWorkingDay: '2026-01-20', exitReason: 'RESIGNATION' });
    const s = (await post(`/${alice.employee.id}/calculate`, finance)).body;
    expect((await post(`/id/${s.id}/pay`, finance)).status).toBe(409);
    await post(`/id/${s.id}/approve`, admin);
    expect((await post(`/id/${s.id}/pay`, finance)).status).toBe(200);
    expect((await post(`/id/${s.id}/pay`, finance)).status).toBe(409);
    expect((await prisma.expenseClaim.findUniqueOrThrow({ where: { id: claim.id } })).status).toBe(
      'REIMBURSED',
    );
    expect(
      await prisma.emailDispatch.count({ where: { kind: 'SETTLEMENT_STATEMENT', entityId: s.id } }),
    ).toBe(1);
    await prisma.emailDispatch.deleteMany({ where: { entityId: s.id } });
  });

  it('is invisible outside the reach of the viewer: another department’s settlement is a 404', async () => {
    await exit(hr, { lastWorkingDay: '2026-01-20', exitReason: 'RESIGNATION' });
    await post(`/${alice.employee.id}/calculate`, finance);
    expect(
      (await request(app).get(`/api/settlements/${alice.employee.id}`).set(deptReader.header))
        .status,
    ).toBe(404);
    expect(
      (await request(app).get(`/api/settlements/${alice.employee.id}`).set(finance.header)).status,
    ).toBe(200);
    const listed = (await request(app).get('/api/settlements').set(deptReader.header)).body;
    expect(listed.every((x: { employeeId: string }) => x.employeeId !== alice.employee.id)).toBe(
      true,
    );
  });
});
