import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '@erp/db';
import { createApp } from '../../app.js';
import { makeActor } from '../../test-utils/access.js';
import {
  cleanAssetData,
  hireActor,
  makeAsset,
  makeCategory,
  makeDepartment,
} from './asset.fixtures.js';

const prefix = 'zzassetrec';
const app = createApp();
let departmentId: string;
let alice: Awaited<ReturnType<typeof hireActor>>;
let bob: Awaited<ReturnType<typeof hireActor>>;
let hr: Awaited<ReturnType<typeof hireActor>>;
let category: { id: string };

beforeAll(async () => {
  departmentId = (await makeDepartment(prefix)).id;
  alice = await hireActor(prefix, departmentId);
  bob = await hireActor(prefix, departmentId);
  hr = await hireActor(prefix, departmentId, ['asset.read:all', 'asset.manage:all']);
  category = await makeCategory(
    app,
    (await makeActor(prefix, 'STANDARD', ['asset.config'])).header,
    prefix,
  );
});
afterAll(async () => {
  await cleanAssetData(prefix, [departmentId]);
});

type Who = { header: Record<string, string> };
const held = async (who: { employee: { id: string } }) => {
  const asset = await makeAsset(app, hr.header, category.id);
  const a = await request(app)
    .post(`/api/assets/${asset.id}/assign`)
    .set(hr.header)
    .send({ employeeId: who.employee.id, conditionOut: 'GOOD' });
  return { asset, assignment: a.body as { id: string } };
};
const raise = (who: Who, body: object) =>
  request(app).post('/api/assets/recoveries').set(who.header).send(body);

describe('raising a recovery', () => {
  it('needs asset.manage, a priced amount above zero and a reason', async () => {
    const { asset } = await held(alice);
    const body = {
      assetId: asset.id,
      employeeId: alice.employee.id,
      kind: 'DAMAGED',
      amount: '2500',
      reason: 'Cracked screen',
    };
    expect((await raise(alice, body)).status).toBe(403);
    expect((await raise(hr, { ...body, amount: '0' })).status).toBe(400);
    expect((await raise(hr, { ...body, reason: '  ' })).status).toBe(400);
    expect((await raise(hr, { ...body, amount: '10.005' })).status).toBe(400);
    const res = await raise(hr, body);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      status: 'PENDING',
      kind: 'DAMAGED',
      amount: '2500.00',
      currency: 'BDT',
      employeeId: alice.employee.id,
    });
    expect(
      (
        await prisma.auditLog.findFirst({
          where: { entity: 'ASSET_RECOVERY', entityId: res.body.id, action: 'CREATE' },
        })
      )?.changedBy,
    ).toBe(hr.user.id);
  });

  it('needs custody history, so an employee who never held the asset cannot be charged for it', async () => {
    const { asset } = await held(alice);
    const res = await raise(hr, {
      assetId: asset.id,
      employeeId: bob.employee.id,
      amount: '100',
      reason: 'Lost',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no assignment history/);
  });

  it('is raised with the damaged return that caused it, atomically', async () => {
    const { asset } = await held(alice);
    const ok = await request(app)
      .post(`/api/assets/${asset.id}/return`)
      .set(hr.header)
      .send({ conditionIn: 'DAMAGED', recovery: { amount: '900', reason: 'Dropped' } });
    expect(ok.status).toBe(200);
    const [recovery] = await prisma.assetRecovery.findMany({ where: { assetId: asset.id } });
    expect(recovery).toMatchObject({
      kind: 'DAMAGED',
      employeeId: alice.employee.id,
      status: 'PENDING',
    });
    const second = await held(bob);
    const bad = await request(app)
      .post(`/api/assets/${second.asset.id}/return`)
      .set(hr.header)
      .send({ conditionIn: 'DAMAGED', recovery: { amount: '0', reason: 'Free' } });
    expect(bad.status).toBe(400);
    expect(
      (await prisma.assetAssignment.findUniqueOrThrow({ where: { id: second.assignment.id } }))
        .returnedAt,
    ).toBeNull();
  });
});

describe('correcting and waiving', () => {
  it('edits a pending recovery, records the change, and refuses a zero amount', async () => {
    const { asset } = await held(alice);
    const rec = (
      await raise(hr, {
        assetId: asset.id,
        employeeId: alice.employee.id,
        amount: '500',
        reason: 'Charger',
      })
    ).body;
    expect(
      (await request(app).patch(`/api/assets/recoveries/${rec.id}`).set(hr.header).send({})).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .patch(`/api/assets/recoveries/${rec.id}`)
          .set(hr.header)
          .send({ amount: '0' })
      ).status,
    ).toBe(400);
    const res = await request(app)
      .patch(`/api/assets/recoveries/${rec.id}`)
      .set(hr.header)
      .send({ amount: '650.5', reason: 'Charger and cable' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ amount: '650.50', reason: 'Charger and cable' });
    const audit = await prisma.auditLog.findFirst({
      where: { entity: 'ASSET_RECOVERY', entityId: rec.id, action: 'UPDATE' },
    });
    expect(audit?.before).toMatchObject({ amount: '500.00' });
  });

  it('waives with a named author and a reason, keeps the row, and freezes it', async () => {
    const { asset } = await held(alice);
    const rec = (
      await raise(hr, {
        assetId: asset.id,
        employeeId: alice.employee.id,
        amount: '500',
        reason: 'Charger',
      })
    ).body;
    expect(
      (await request(app).post(`/api/assets/recoveries/${rec.id}/waive`).set(hr.header).send({}))
        .status,
    ).toBe(400);
    const res = await request(app)
      .post(`/api/assets/recoveries/${rec.id}/waive`)
      .set(hr.header)
      .send({ waiverReason: 'Faulty from new' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'WAIVED',
      waivedBy: hr.user.id,
      waiverReason: 'Faulty from new',
    });
    expect(
      (
        await request(app)
          .post(`/api/assets/recoveries/${rec.id}/waive`)
          .set(hr.header)
          .send({ waiverReason: 'again' })
      ).status,
    ).toBe(409);
    expect(
      (
        await request(app)
          .patch(`/api/assets/recoveries/${rec.id}`)
          .set(hr.header)
          .send({ amount: '1' })
      ).status,
    ).toBe(409);
    expect(await prisma.assetRecovery.count({ where: { id: rec.id } })).toBe(1);
  });

  it('refuses to edit or waive one that was already collected', async () => {
    const { asset } = await held(alice);
    const rec = (
      await raise(hr, {
        assetId: asset.id,
        employeeId: alice.employee.id,
        amount: '500',
        reason: 'Charger',
      })
    ).body;
    await prisma.assetRecovery.update({ where: { id: rec.id }, data: { status: 'RECOVERED' } });
    expect(
      (
        await request(app)
          .post(`/api/assets/recoveries/${rec.id}/waive`)
          .set(hr.header)
          .send({ waiverReason: 'x' })
      ).status,
    ).toBe(409);
    expect(
      (
        await request(app)
          .patch(`/api/assets/recoveries/${rec.id}`)
          .set(hr.header)
          .send({ amount: '1' })
      ).status,
    ).toBe(409);
  });
});

describe('who sees which recoveries', () => {
  it('shows a person their own and a reader of everything all of them', async () => {
    const a = await held(alice);
    const b = await held(bob);
    const hers = (
      await raise(hr, {
        assetId: a.asset.id,
        employeeId: alice.employee.id,
        amount: '10',
        reason: 'x',
      })
    ).body;
    const his = (
      await raise(hr, {
        assetId: b.asset.id,
        employeeId: bob.employee.id,
        amount: '10',
        reason: 'x',
      })
    ).body;
    const idsFor = async (who: Who, query: object = {}) =>
      (await request(app).get('/api/assets/recoveries').query(query).set(who.header)).body.map(
        (r: { id: string }) => r.id,
      );
    expect(await idsFor(alice)).toContain(hers.id);
    expect(await idsFor(alice)).not.toContain(his.id);
    expect(await idsFor(alice, { employeeId: bob.employee.id })).toEqual([]);
    expect(await idsFor(hr)).toEqual(expect.arrayContaining([hers.id, his.id]));
    expect(await idsFor(hr, { employeeId: bob.employee.id, status: 'PENDING' })).toEqual([his.id]);
  });

  it('has no delete: a mistaken recovery is waived, not erased', async () => {
    const res = await request(app).delete('/api/assets/recoveries/anything').set(hr.header);
    expect(res.status).toBe(405);
  });
});
