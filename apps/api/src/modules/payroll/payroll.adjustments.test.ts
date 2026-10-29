import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '@erp/db';
import { createApp } from '../../app.js';
import { makeActor } from '../../test-utils/access.js';
import { cleanAssetData } from '../asset/asset.fixtures.js';
import { cleanPayrollData, hireActor, makeDepartment, makeStructure } from './payroll.fixtures.js';

const YEAR = 2026;
const MONTH = 2;
const prefix = 'zzpayadj';
const app = createApp();
let departmentId: string;
let otherDepartmentId: string;
let config: Awaited<ReturnType<typeof makeActor>>;
let finance: Awaited<ReturnType<typeof makeActor>>;
let deptManager: Awaited<ReturnType<typeof hireActor>>;
let assetManager: Awaited<ReturnType<typeof makeActor>>;
let alice: Awaited<ReturnType<typeof hireActor>>;
let carol: Awaited<ReturnType<typeof hireActor>>;

const post = (path: string, who: { header: Record<string, string> }, body: object = {}) =>
  request(app).post(path).set(who.header).send(body);
const adjustment = (over: Record<string, unknown> = {}) => ({
  employeeId: alice.employee.id,
  month: MONTH,
  year: YEAR,
  kind: 'EARNING',
  code: 'FESTIVAL_BONUS',
  label: 'Festival bonus',
  amount: '1000',
  reason: 'Eid',
  ...over,
});
async function cleanRuns() {
  await prisma.assetRecovery.updateMany({
    where: { employeeId: alice.employee.id },
    data: { adjustmentId: null },
  });
  await prisma.payrollAdjustment.deleteMany({
    where: { employeeId: { in: [alice.employee.id, carol.employee.id] } },
  });
  await prisma.payslip.deleteMany({ where: { payrollRun: { year: YEAR } } });
  await prisma.payrollRun.deleteMany({ where: { year: YEAR } });
}

beforeAll(async () => {
  departmentId = (await makeDepartment(prefix)).id;
  otherDepartmentId = (await makeDepartment(prefix)).id;
  config = await makeActor(prefix, 'STANDARD', ['payroll.config']);
  finance = await makeActor(prefix, 'STANDARD', ['payroll.read:all', 'payroll.manage:all']);
  deptManager = await hireActor(prefix, departmentId, [
    'payroll.read:department',
    'payroll.manage:department',
  ]);
  assetManager = await makeActor(prefix, 'STANDARD', ['asset.manage:all', 'asset.read:all']);
  alice = await hireActor(prefix, departmentId);
  carol = await hireActor(prefix, otherDepartmentId);
  const structure = await makeStructure(app, config.header, prefix);
  for (const who of [alice, carol, deptManager]) {
    await prisma.employee.update({
      where: { id: who.employee.id },
      data: { salaryStructureId: structure.id },
    });
  }
});
afterEach(cleanRuns);
afterAll(async () => {
  await cleanRuns();
  await prisma.payrollSetting.deleteMany({});
  await cleanPayrollData(prefix, [departmentId, otherDepartmentId], [YEAR]);
  await cleanAssetData(prefix, [departmentId, otherDepartmentId]);
});

describe('payroll adjustments', () => {
  it('need a reason, and stay within the department a department manager reaches', async () => {
    expect(
      (await post('/api/payroll/adjustments', finance, adjustment({ reason: '' }))).status,
    ).toBe(400);
    expect(
      (
        await post(
          '/api/payroll/adjustments',
          deptManager,
          adjustment({ employeeId: carol.employee.id }),
        )
      ).status,
    ).toBe(404);
    expect((await post('/api/payroll/adjustments', deptManager, adjustment())).status).toBe(201);
    const listed = await request(app).get('/api/payroll/adjustments').set(deptManager.header);
    expect(
      listed.body.every((a: { employeeId: string }) => a.employeeId !== carol.employee.id),
    ).toBe(true);
  });

  it('are paid once on a payslip and cannot be deleted afterwards', async () => {
    const made = (await post('/api/payroll/adjustments', finance, adjustment())).body;
    const run = (await post('/api/payroll/runs', finance, { month: MONTH, year: YEAR })).body;
    expect((await post(`/api/payroll/runs/${run.id}/process`, finance)).status).toBe(200);
    const slip = (
      await request(app).get(`/api/payroll/runs/${run.id}`).set(finance.header)
    ).body.payslips.find((p: { employeeId: string }) => p.employeeId === alice.employee.id);
    expect(slip.breakdown.adjustments).toEqual([
      expect.objectContaining({ code: 'FESTIVAL_BONUS', amount: '1000.00' }),
    ]);
    expect(
      (await request(app).delete(`/api/payroll/adjustments/${made.id}`).set(finance.header)).status,
    ).toBe(409);
    await request(app).delete(`/api/payroll/runs/${run.id}`).set(finance.header);
    expect(
      (await prisma.payrollAdjustment.findUniqueOrThrow({ where: { id: made.id } })).payslipId,
    ).toBeNull();
    expect(
      (await request(app).delete(`/api/payroll/adjustments/${made.id}`).set(finance.header)).status,
    ).toBe(200);
  });

  it('collect an asset recovery through payroll once, unless the company has switched that off', async () => {
    const category = await prisma.assetCategory.create({
      data: { code: `${prefix.toUpperCase()}_LAP`, name: `${prefix} laptop`, classification: 'IT' },
    });
    const asset = await prisma.asset.create({
      data: { assetTag: `${prefix}-A1`, categoryId: category.id, name: 'Laptop', departmentId },
    });
    const assignment = await prisma.assetAssignment.create({
      data: {
        assetId: asset.id,
        employeeId: alice.employee.id,
        assignedAt: new Date(),
        assignedBy: 'x',
        conditionOut: 'GOOD',
      },
    });
    const recovery = await prisma.assetRecovery.create({
      data: {
        assetId: asset.id,
        employeeId: alice.employee.id,
        assignmentId: assignment.id,
        kind: 'LOST',
        amount: '400',
        currency: 'BDT',
        reason: 'Lost',
        createdBy: 'x',
      },
    });
    await prisma.payrollSetting.upsert({
      where: { id: 'payroll' },
      update: { recoverAssetsFromSalary: false },
      create: { id: 'payroll', recoverAssetsFromSalary: false },
    });
    expect(
      (await post(`/api/assets/recoveries/${recovery.id}/recover-from-payroll`, assetManager))
        .status,
    ).toBe(409);
    await prisma.payrollSetting.update({
      where: { id: 'payroll' },
      data: { recoverAssetsFromSalary: true },
    });
    expect(
      (await post(`/api/assets/recoveries/${recovery.id}/recover-from-payroll`, assetManager))
        .status,
    ).toBe(200);
    expect(
      (await post(`/api/assets/recoveries/${recovery.id}/recover-from-payroll`, assetManager))
        .status,
    ).toBe(409);
    const linked = await prisma.assetRecovery.findUniqueOrThrow({ where: { id: recovery.id } });
    expect(linked.adjustmentId).not.toBeNull();

    const run = (
      await post('/api/payroll/runs', finance, {
        month: new Date().getUTCMonth() + 1,
        year: new Date().getUTCFullYear(),
      })
    ).body;
    await prisma.payrollRun.deleteMany({ where: { id: run.id } });
    await prisma.assetRecovery.update({ where: { id: recovery.id }, data: { adjustmentId: null } });
    await prisma.assetAssignment.delete({ where: { id: assignment.id } });
    await prisma.assetRecovery.delete({ where: { id: recovery.id } });
    await prisma.asset.delete({ where: { id: asset.id } });
    await prisma.assetCategory.delete({ where: { id: category.id } });
  });
});
