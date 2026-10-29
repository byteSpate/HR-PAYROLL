import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '@erp/db';
import { createApp } from '../../app.js';
import { makeActor } from '../../test-utils/access.js';
import { cleanPayrollData, hireActor, makeDepartment, makeStructure } from './payroll.fixtures.js';

const prefix = 'zzpaycfg';
const app = createApp();
let departmentId: string;
let config: Awaited<ReturnType<typeof makeActor>>;
let reader: Awaited<ReturnType<typeof makeActor>>;
let hr: Awaited<ReturnType<typeof hireActor>>;
let alice: Awaited<ReturnType<typeof hireActor>>;

beforeAll(async () => {
  departmentId = (await makeDepartment(prefix)).id;
  config = await makeActor(prefix, 'STANDARD', ['payroll.config']);
  reader = await makeActor(prefix, 'STANDARD', ['payroll.read:all']);
  hr = await hireActor(prefix, departmentId, ['employee.read:all', 'employee.update:all']);
  alice = await hireActor(prefix, departmentId);
});
afterAll(async () => {
  await prisma.payrollSetting.deleteMany({});
  await cleanPayrollData(prefix, [departmentId], []);
});

describe('salary structures', () => {
  it('are authored by payroll.config alone and read by payroll.read', async () => {
    const body = { name: `${prefix} gate`, currency: 'BDT', basic: '1000', components: [] };
    expect(
      (await request(app).post('/api/payroll/salary-structures').set(reader.header).send(body))
        .status,
    ).toBe(403);
    expect(
      (await request(app).post('/api/payroll/salary-structures').set(config.header).send(body))
        .status,
    ).toBe(201);
    expect(
      (await request(app).get('/api/payroll/salary-structures').set(reader.header)).status,
    ).toBe(200);
  });

  it('refuse duplicate component codes and a currency change', async () => {
    const dup = {
      name: `${prefix} dup`,
      currency: 'BDT',
      basic: '1000',
      components: [
        { code: 'A', label: 'A', kind: 'EARNING', calc: 'FIXED', value: '1' },
        { code: 'A', label: 'B', kind: 'EARNING', calc: 'FIXED', value: '2' },
      ],
    };
    expect(
      (await request(app).post('/api/payroll/salary-structures').set(config.header).send(dup))
        .status,
    ).toBe(400);
    const made = await makeStructure(app, config.header, prefix);
    const res = await request(app)
      .patch(`/api/payroll/salary-structures/${made.id}`)
      .set(config.header)
      .send({ name: made.name, currency: 'USD', basic: '50000', components: [] });
    expect(res.status).toBe(409);
  });

  it('keep amounts as exact decimals, refusing one the column would round', async () => {
    const res = await request(app)
      .post('/api/payroll/salary-structures')
      .set(config.header)
      .send({ name: `${prefix} fine`, currency: 'BDT', basic: '1000.005', components: [] });
    expect(res.status).toBe(400);
  });

  it('cannot be deleted while a person is on one, and the count says so', async () => {
    const made = await makeStructure(app, config.header, prefix);
    expect(
      (
        await request(app)
          .put(`/api/employees/${alice.employee.id}/salary-structure`)
          .set(hr.header)
          .send({ salaryStructureId: made.id })
      ).status,
    ).toBe(200);
    const listed = (await request(app).get('/api/payroll/salary-structures').set(reader.header))
      .body;
    expect(listed.find((s: { id: string }) => s.id === made.id).employeeCount).toBe(1);
    const res = await request(app)
      .delete(`/api/payroll/salary-structures/${made.id}`)
      .set(config.header);
    expect(res.status).toBe(409);
    await request(app)
      .put(`/api/employees/${alice.employee.id}/salary-structure`)
      .set(hr.header)
      .send({ salaryStructureId: null });
    expect(
      (await request(app).delete(`/api/payroll/salary-structures/${made.id}`).set(config.header))
        .status,
    ).toBe(200);
  });

  it('record assignment before and after, and refuse an inactive structure', async () => {
    const made = await makeStructure(app, config.header, prefix, { isActive: false });
    expect(
      (
        await request(app)
          .put(`/api/employees/${alice.employee.id}/salary-structure`)
          .set(hr.header)
          .send({ salaryStructureId: made.id })
      ).status,
    ).toBe(409);
    const ok = await makeStructure(app, config.header, prefix);
    await request(app)
      .put(`/api/employees/${alice.employee.id}/salary-structure`)
      .set(hr.header)
      .send({ salaryStructureId: ok.id });
    const row = await prisma.auditLog.findFirst({
      where: { entity: 'EMPLOYEE_SALARY_STRUCTURE', entityId: alice.employee.id },
      orderBy: { changedAt: 'desc' },
    });
    expect(row?.after).toMatchObject({ salaryStructure: ok.name });
    expect(
      (
        await request(app)
          .put(`/api/employees/${alice.employee.id}/salary-structure`)
          .set(alice.header)
          .send({ salaryStructureId: null })
      ).status,
    ).toBe(403);
  });

  it('export writes one audit row', async () => {
    const res = await request(app)
      .get('/api/payroll/salary-structures/export?format=csv')
      .set(config.header);
    expect(res.status).toBe(200);
    expect(
      await prisma.auditLog.count({ where: { action: 'EXPORT', changedBy: config.user.id } }),
    ).toBe(1);
  });
});

describe('payroll settings', () => {
  it('default to on, change one switch alone, and audit it', async () => {
    await prisma.payrollSetting.deleteMany({});
    expect((await request(app).get('/api/payroll/settings').set(reader.header)).body).toEqual({
      deductLossOfPay: true,
      recoverAssetsFromSalary: true,
    });
    expect(
      (
        await request(app)
          .patch('/api/payroll/settings')
          .set(reader.header)
          .send({ deductLossOfPay: false })
      ).status,
    ).toBe(403);
    const res = await request(app)
      .patch('/api/payroll/settings')
      .set(config.header)
      .send({ deductLossOfPay: false });
    expect(res.body).toEqual({ deductLossOfPay: false, recoverAssetsFromSalary: true });
    expect(
      (await request(app).patch('/api/payroll/settings').set(config.header).send({})).status,
    ).toBe(400);
    expect(
      await prisma.auditLog.count({
        where: { entity: 'PAYROLL_SETTING', changedBy: config.user.id },
      }),
    ).toBe(1);
  });
});
