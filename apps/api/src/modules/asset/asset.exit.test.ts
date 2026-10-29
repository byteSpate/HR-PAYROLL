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
import { exitChecklist, listOpenRecoveries } from './asset.exit.js';
import { sweepRecoveriesCollected } from './asset.sweep.js';

const prefix = 'zzassetext';
const app = createApp();
let departmentId: string;
let alice: Awaited<ReturnType<typeof hireActor>>;
let bob: Awaited<ReturnType<typeof hireActor>>;
let hr: Awaited<ReturnType<typeof hireActor>>;
let laptop: { id: string };
let mouse: { id: string };

beforeAll(async () => {
  departmentId = (await makeDepartment(prefix)).id;
  alice = await hireActor(prefix, departmentId);
  bob = await hireActor(prefix, departmentId);
  hr = await hireActor(prefix, departmentId, ['asset.read:all', 'asset.manage:all']);
  const config = await makeActor(prefix, 'STANDARD', ['asset.config']);
  laptop = await makeCategory(app, config.header, prefix);
  mouse = await makeCategory(app, config.header, prefix, { isConsumable: true });
});
afterAll(async () => {
  await cleanAssetData(prefix, [departmentId]);
});

const give = async (categoryId: string, who: { employee: { id: string } }) => {
  const asset = await makeAsset(app, hr.header, categoryId);
  await request(app)
    .post(`/api/assets/${asset.id}/assign`)
    .set(hr.header)
    .send({ employeeId: who.employee.id, conditionOut: 'GOOD' });
  return asset;
};

describe('the exit checklist', () => {
  it('lists what a leaver still holds and what they owe, leaves out consumables, and only warns', async () => {
    const mine = await give(laptop.id, alice);
    await give(mouse.id, alice);
    await request(app)
      .post('/api/assets/recoveries')
      .set(hr.header)
      .send({
        assetId: mine.id,
        employeeId: alice.employee.id,
        amount: '700',
        reason: 'Charger lost',
      });
    const list = await exitChecklist(alice.employee.id);
    expect(list.openAssignments.map((a) => a.assetTag)).toEqual([mine.assetTag]);
    expect(list.pendingRecoveries).toHaveLength(1);
    expect(list.hasOutstanding).toBe(true);
    expect(await exitChecklist(bob.employee.id)).toMatchObject({
      openAssignments: [],
      pendingRecoveries: [],
      hasOutstanding: false,
    });
  });

  it('is readable over HTTP by whoever manages assets, and by nobody else', async () => {
    const res = await request(app)
      .get(`/api/assets/exit-checklist/${alice.employee.id}`)
      .set(hr.header);
    expect(res.status).toBe(200);
    expect(res.body.employeeId).toBe(alice.employee.id);
    expect(
      (await request(app).get(`/api/assets/exit-checklist/${alice.employee.id}`).set(alice.header))
        .status,
    ).toBe(403);
  });

  it('shows only pending recoveries, inside the caller’s transaction when given one', async () => {
    const asset = await give(laptop.id, bob);
    const rec = (
      await request(app)
        .post('/api/assets/recoveries')
        .set(hr.header)
        .send({ assetId: asset.id, employeeId: bob.employee.id, amount: '50', reason: 'Bag' })
    ).body;
    expect((await listOpenRecoveries(bob.employee.id)).map((r) => r.id)).toEqual([rec.id]);
    await prisma.$transaction(async (tx) => {
      await tx.assetRecovery.update({ where: { id: rec.id }, data: { status: 'WAIVED' } });
      expect(await listOpenRecoveries(bob.employee.id, tx)).toEqual([]);
    });
  });
});

describe('marking recoveries collected', () => {
  it('flips the pending ones a payslip or settlement collected, and emits one event for each, in the same transaction', async () => {
    const a = await give(laptop.id, alice);
    const recs = [
      (
        await request(app)
          .post('/api/assets/recoveries')
          .set(hr.header)
          .send({ assetId: a.id, employeeId: alice.employee.id, amount: '10', reason: 'x' })
      ).body,
      (
        await request(app)
          .post('/api/assets/recoveries')
          .set(hr.header)
          .send({ assetId: a.id, employeeId: alice.employee.id, amount: '20', reason: 'y' })
      ).body,
    ];
    const waived = (
      await request(app)
        .post('/api/assets/recoveries')
        .set(hr.header)
        .send({ assetId: a.id, employeeId: alice.employee.id, amount: '30', reason: 'z' })
    ).body;
    await request(app)
      .post(`/api/assets/recoveries/${waived.id}/waive`)
      .set(hr.header)
      .send({ waiverReason: 'forgiven' });

    await prisma.$transaction((tx) =>
      sweepRecoveriesCollected(
        tx,
        {
          employeeId: alice.employee.id,
          id: { in: [...recs.map((r: { id: string }) => r.id), waived.id] },
          status: 'PENDING',
        },
        hr.user.id,
      ),
    );

    const after = await prisma.assetRecovery.findMany({
      where: { id: { in: [...recs.map((r: { id: string }) => r.id), waived.id] } },
    });
    expect(after.filter((r) => r.status === 'RECOVERED')).toHaveLength(2);
    expect(after.find((r) => r.id === waived.id)?.status).toBe('WAIVED');
    for (const r of recs)
      expect(
        await prisma.outboxEvent.count({
          where: {
            type: 'asset.recovery.collected',
            payload: { path: ['recoveryId'], equals: r.id },
          },
        }),
      ).toBe(1);
  });
});
