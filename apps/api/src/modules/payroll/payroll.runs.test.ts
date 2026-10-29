import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '@erp/db';
import { createApp } from '../../app.js';
import { makeActor } from '../../test-utils/access.js';
import { cleanPayrollData, hireActor, makeDepartment, makeStructure } from './payroll.fixtures.js';

// January 2026 is over and has 31 calendar days; no one in this file has attendance for it, so every person
// is absent the whole month unless the figures say otherwise. The assertions read the figures back instead of
// assuming them, so they hold whatever the attendance engine says.
const YEAR = 2026;
const MONTH = 1;
const prefix = 'zzpayrun';
const app = createApp();
let departmentId: string;
let config: Awaited<ReturnType<typeof makeActor>>;
let finance: Awaited<ReturnType<typeof makeActor>>;
let approver: Awaited<ReturnType<typeof makeActor>>;
let admin: Awaited<ReturnType<typeof makeActor>>;
let alice: Awaited<ReturnType<typeof hireActor>>;
let bob: Awaited<ReturnType<typeof hireActor>>;
let teamReader: Awaited<ReturnType<typeof hireActor>>;
let structureId: string;
let categoryId: string;

const post = (path: string, who: { header: Record<string, string> }, body: object = {}) =>
  request(app).post(`/api/payroll${path}`).set(who.header).send(body);
const get = (path: string, who: { header: Record<string, string> }) =>
  request(app).get(`/api/payroll${path}`).set(who.header);
const openRun = async () =>
  (await post('/runs', finance, { month: MONTH, year: YEAR })).body as { id: string };
const dropRuns = () => cleanRuns();
async function cleanRuns() {
  await prisma.expenseClaim.updateMany({
    data: { payslipId: null },
    where: { employeeId: { in: [alice.employee.id, bob.employee.id] } },
  });
  await prisma.payrollAdjustment.deleteMany({
    where: { employeeId: { in: [alice.employee.id, bob.employee.id] } },
  });
  await prisma.payslip.deleteMany({ where: { payrollRun: { year: YEAR } } });
  await prisma.payrollRun.deleteMany({ where: { year: YEAR } });
}

beforeAll(async () => {
  departmentId = (await makeDepartment(prefix)).id;
  config = await makeActor(prefix, 'STANDARD', ['payroll.config']);
  finance = await makeActor(prefix, 'STANDARD', [
    'payroll.read:all',
    'payroll.manage:all',
    'payroll.disburse:all',
  ]);
  approver = await makeActor(prefix, 'STANDARD', ['payroll.approve:all', 'payroll.read:all']);
  admin = await makeActor(prefix, 'ADMIN');
  alice = await hireActor(prefix, departmentId);
  bob = await hireActor(prefix, departmentId);
  teamReader = await hireActor(prefix, departmentId, ['employee.read:all']);
  structureId = (await makeStructure(app, config.header, prefix)).id;
  categoryId = (
    await prisma.expenseCategory.create({
      data: { code: `${prefix.toUpperCase()}_X`, name: `${prefix} cat` },
    })
  ).id;
  for (const who of [alice, bob, teamReader]) {
    await prisma.employee.update({
      where: { id: who.employee.id },
      data: {
        salaryStructureId: structureId,
        bankName: 'Test Bank',
        bankAccountNumber: `A${who.employee.id.slice(0, 8)}`,
        bankRoutingNumber: '090261726',
      },
    });
  }
  await cleanRuns();
});
afterEach(async () => {
  await dropRuns();
});
afterAll(async () => {
  await cleanRuns();
  await cleanPayrollData(prefix, [departmentId], [YEAR]);
});

describe('payroll runs', () => {
  it('are opened by payroll.manage and read by payroll.read, and nobody else gets in', async () => {
    expect((await post('/runs', approver, { month: MONTH, year: YEAR })).status).toBe(403);
    expect((await get('/runs', teamReader)).status).toBe(403);
    expect((await get('/runs', finance)).status).toBe(200);
  });

  it('keep one live run per month: two openings at once leave one run and one 409', async () => {
    const results = await Promise.all([
      post('/runs', finance, { month: MONTH, year: YEAR }),
      post('/runs', finance, { month: MONTH, year: YEAR }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(
      await prisma.payrollRun.count({ where: { year: YEAR, month: MONTH, deletedAt: null } }),
    ).toBe(1);
    await dropRuns();
  });

  it('refuse a month that has not started, and block processing on a person with no structure', async () => {
    expect((await post('/runs', finance, { month: 12, year: 2090 })).status).toBe(400);
    const run = await openRun();
    await prisma.employee.update({
      where: { id: bob.employee.id },
      data: { salaryStructureId: null },
    });
    const res = await post(`/runs/${run.id}/process`, finance);
    expect(res.status).toBe(409);
    expect(res.body.blockers.map((b: { code: string }) => b.code)).toContain(
      'MISSING_SALARY_STRUCTURE',
    );
    await prisma.employee.update({
      where: { id: bob.employee.id },
      data: { salaryStructureId: structureId },
    });
    await dropRuns();
  });

  it('process one payslip each, rebuilt on a second process, with totals equal to their lines', async () => {
    const run = await openRun();
    expect((await post(`/runs/${run.id}/process`, finance)).status).toBe(200);
    expect((await post(`/runs/${run.id}/process`, finance)).status).toBe(200);
    const detail = (await get(`/runs/${run.id}`, finance)).body;
    const mine = detail.payslips.filter((p: { employeeId: string }) =>
      [alice.employee.id, bob.employee.id].includes(p.employeeId),
    );
    expect(mine).toHaveLength(2);
    for (const p of mine) {
      expect(p.payslipNo).toMatch(/^BS-PAY-\d{5,}$/);
      const earnings = p.breakdown.earnings.reduce(
        (a: number, l: { amount: string }) => a + Number(l.amount),
        0,
      );
      expect(Number(p.grossPay)).toBeCloseTo(earnings, 2);
      expect(Number(p.netPay)).toBeCloseTo(Number(p.grossPay) - Number(p.totalDeductions), 2);
      expect(Number(p.netPayable)).toBeCloseTo(Number(p.netPay) + Number(p.reimbursements), 2);
    }
    expect(new Set(mine.map((p: { payslipNo: string }) => p.payslipNo)).size).toBe(2);
    await dropRuns();
  });

  it('two people processing at once leave one payslip per person', async () => {
    const run = await openRun();
    const both = await Promise.all([
      post(`/runs/${run.id}/process`, finance),
      post(`/runs/${run.id}/process`, finance),
    ]);
    expect(both.map((r) => r.status)).toEqual([200, 200]);
    expect(
      await prisma.payslip.count({
        where: { payrollRunId: run.id, employeeId: alice.employee.id },
      }),
    ).toBe(1);
    await dropRuns();
  });

  it('take an approved claim once: released when the draft is deleted, paid when the run is disbursed', async () => {
    const claim = await prisma.expenseClaim.create({
      data: {
        employeeId: alice.employee.id,
        name: 'Lunch',
        amount: '33.33',
        categoryId,
        currency: 'BDT',
        expenseDate: new Date('2026-01-10T00:00:00Z'),
        status: 'APPROVED',
        fxRateToBdt: '1',
      },
    });
    const first = await openRun();
    await post(`/runs/${first.id}/process`, finance);
    expect(
      (await prisma.expenseClaim.findUniqueOrThrow({ where: { id: claim.id } })).payslipId,
    ).not.toBeNull();
    expect(
      (await request(app).delete(`/api/payroll/runs/${first.id}`).set(finance.header)).status,
    ).toBe(200);
    const released = await prisma.expenseClaim.findUniqueOrThrow({ where: { id: claim.id } });
    expect(released).toMatchObject({ payslipId: null, status: 'APPROVED' });

    const run = await openRun();
    await post(`/runs/${run.id}/process`, finance);
    await post(`/runs/${run.id}/submit`, finance);
    expect((await post(`/runs/${run.id}/approve`, admin)).status).toBe(200);
    expect((await post(`/runs/${run.id}/disburse`, finance)).status).toBe(200);
    expect((await prisma.expenseClaim.findUniqueOrThrow({ where: { id: claim.id } })).status).toBe(
      'REIMBURSED',
    );
    expect((await post(`/runs/${run.id}/disburse`, finance)).status).toBe(409);
    const slip = (await get(`/runs/${run.id}`, finance)).body.payslips.find(
      (p: { employeeId: string }) => p.employeeId === alice.employee.id,
    );
    expect(slip.reimbursements).toBe('33.33');
    await prisma.expenseClaim.delete({ where: { id: claim.id } });
    await dropRuns();
  });

  it('keep separation of duties: the preparer cannot approve, an approver can, a returned run needs a note', async () => {
    const preparer = await makeActor(prefix, 'STANDARD', [
      'payroll.read:all',
      'payroll.manage:all',
      'payroll.approve:all',
    ]);
    const run = (await post('/runs', preparer, { month: MONTH, year: YEAR })).body;
    await post(`/runs/${run.id}/process`, preparer);
    await post(`/runs/${run.id}/submit`, preparer);
    expect((await post(`/runs/${run.id}/approve`, preparer)).status).toBe(403);
    expect((await post(`/runs/${run.id}/reject`, approver, {})).status).toBe(400);
    expect((await post(`/runs/${run.id}/reject`, approver, { note: 'Fix the bonus' })).status).toBe(
      200,
    );
    expect((await get(`/runs/${run.id}`, finance)).body.status).toBe('DRAFT');
    await post(`/runs/${run.id}/submit`, preparer);
    expect((await post(`/runs/${run.id}/approve`, approver)).status).toBe(200);
    expect(
      (await request(app).delete(`/api/payroll/runs/${run.id}`).set(preparer.header)).status,
    ).toBe(409);
    await dropRuns();
  });

  it('write the figures for the books when approved, and a bank file with one row per payee', async () => {
    const run = await openRun();
    await post(`/runs/${run.id}/process`, finance);
    expect((await get(`/runs/${run.id}/bank-file`, finance)).status).toBe(409);
    await post(`/runs/${run.id}/submit`, finance);
    await post(`/runs/${run.id}/approve`, admin);
    const event = await prisma.outboxEvent.findFirst({
      where: { type: 'payroll.run.finalized', payload: { path: ['runId'], equals: run.id } },
    });
    const detail = (await get(`/runs/${run.id}`, finance)).body;
    const sumNet = detail.payslips.reduce(
      (a: number, p: { netPayableBdt: string }) => a + Number(p.netPayableBdt),
      0,
    );
    expect(Number((event?.payload as { netPayableBdt: string }).netPayableBdt)).toBeCloseTo(
      sumNet,
      2,
    );

    const file = await get(`/runs/${run.id}/bank-file`, finance);
    expect(file.status).toBe(200);
    const summary = (await get(`/runs/${run.id}/bank-file/summary`, finance)).body;
    expect(summary.complete).toBe(true);
    const rows = file.text.trim().split('\r\n').length - 1;
    expect(rows).toBe(detail.payslips.length);
    expect(
      await prisma.auditLog.count({
        where: { entity: 'PAYROLL_RUN', entityId: run.id, action: 'EXPORT' },
      }),
    ).toBe(1);
    await dropRuns();
  });

  it('lock the month once approved: an adjustment for it is refused', async () => {
    const run = await openRun();
    await post(`/runs/${run.id}/process`, finance);
    await post(`/runs/${run.id}/submit`, finance);
    await post(`/runs/${run.id}/approve`, admin);
    const res = await post('/adjustments', finance, {
      employeeId: alice.employee.id,
      month: MONTH,
      year: YEAR,
      kind: 'EARNING',
      code: 'BONUS',
      label: 'Bonus',
      amount: '500',
      reason: 'Eid',
    });
    expect(res.status).toBe(409);
    await dropRuns();
  });
});

describe('payslip visibility', () => {
  it('shows an employee their own payslip only once approved, and never anyone else’s', async () => {
    const run = await openRun();
    await post(`/runs/${run.id}/process`, finance);
    const slips = (await get(`/runs/${run.id}`, finance)).body.payslips;
    const aliceSlip = slips.find((p: { employeeId: string }) => p.employeeId === alice.employee.id);
    expect((await get(`/payslips/${aliceSlip.id}`, alice)).status).toBe(404);
    await post(`/runs/${run.id}/submit`, finance);
    await post(`/runs/${run.id}/approve`, admin);
    expect((await get(`/payslips/${aliceSlip.id}`, alice)).status).toBe(200);
    expect((await get(`/payslips/${aliceSlip.id}`, bob)).status).toBe(404);
    expect((await get(`/payslips/${aliceSlip.id}`, teamReader)).status).toBe(404);
    expect((await get(`/payslips/${aliceSlip.id}`, finance)).status).toBe(200);
    expect((await get(`/payslips/employee/${alice.employee.id}`, bob)).status).toBe(404);
    expect((await get('/payslips/me', alice)).body).toHaveLength(1);

    const pdf = await get(`/payslips/${aliceSlip.id}/pdf`, alice)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(pdf.status).toBe(200);
    expect((pdf.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
    expect((await get(`/payslips/${aliceSlip.id}/pdf`, bob)).status).toBe(404);
    await dropRuns();
  });

  it('records mail as not sent, never as sent, when no mail server is configured', async () => {
    const run = await openRun();
    await post(`/runs/${run.id}/process`, finance);
    expect((await post(`/runs/${run.id}/email`, finance)).status).toBe(409);
    await post(`/runs/${run.id}/submit`, finance);
    await post(`/runs/${run.id}/approve`, admin);
    expect((await post(`/runs/${run.id}/email`, finance)).status).toBe(202);
    let status = (await get(`/runs/${run.id}/email-status`, finance)).body;
    for (let i = 0; i < 100 && status.inProgress; i++) {
      await new Promise((r) => setTimeout(r, 100));
      status = (await get(`/runs/${run.id}/email-status`, finance)).body;
    }
    expect(status.sent).toBe(0);
    expect(status.failed).toBe(status.total);
    expect(
      await prisma.emailDispatch.count({ where: { kind: 'PAYSLIP', entity: 'PAYSLIP' } }),
    ).toBeGreaterThan(0);
    await dropRuns();
  });
});
