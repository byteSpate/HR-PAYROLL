import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '@erp/db';
import { parseDateOnly } from '@erp/export';
import { createApp } from '../../app.js';
import { makeActor } from '../../test-utils/access.js';
import {
  cleanAssetData,
  daysAgo,
  hireActor,
  makeAsset,
  makeCategory,
  makeDepartment,
} from './asset.fixtures.js';

const prefix = 'zzassetled';
const app = createApp();
let departmentId: string;
let alice: Awaited<ReturnType<typeof hireActor>>;
let hr: Awaited<ReturnType<typeof hireActor>>;
let finance: Awaited<ReturnType<typeof hireActor>>;
let category: { id: string };
let supply: { id: string };
let rateId: string | null = null;

beforeAll(async () => {
  departmentId = (await makeDepartment(prefix)).id;
  alice = await hireActor(prefix, departmentId);
  hr = await hireActor(prefix, departmentId, ['asset.read:all', 'asset.manage:all']);
  finance = await hireActor(prefix, departmentId, ['asset.read:all', 'asset.capitalise']);
  const config = await makeActor(prefix, 'STANDARD', ['asset.config']);
  category = await makeCategory(app, config.header, prefix);
  supply = await makeCategory(app, config.header, prefix, { isConsumable: true });
});
afterAll(async () => {
  if (rateId) await prisma.exchangeRate.deleteMany({ where: { id: rateId } });
  await cleanAssetData(prefix, [departmentId]);
});

const costly = (over: Record<string, unknown> = {}) =>
  makeAsset(app, hr.header, category.id, {
    purchaseCost: '1000.50',
    purchaseDate: '2026-01-15',
    departmentId,
    ...over,
  });
const post = (verb: string, id: string, who = finance, body: object = {}) =>
  request(app).post(`/api/assets/${id}/${verb}`).set(who.header).send(body);
const event = (type: string, assetId: string) =>
  prisma.outboxEvent.findFirst({
    where: { type, payload: { path: ['assetId'], equals: assetId } },
  });

describe('capitalising an asset', () => {
  it('needs asset.capitalise, which asset.manage alone does not give', async () => {
    const asset = await costly();
    expect((await post('capitalise', asset.id, hr)).status).toBe(403);
    expect((await post('capitalise', asset.id, alice)).status).toBe(403);
  });

  it('freezes the cost in BDT at a rate of one, stamps who and when, and emits asset.capitalised', async () => {
    const asset = await costly();
    const res = await post('capitalise', asset.id);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      purchaseCostBdt: '1000.50',
      fxRateToBdt: '1.000000',
      paid: false,
      capitalisedBy: finance.user.id,
    });
    expect(res.body.capitalisedAt).not.toBeNull();
    const emitted = await event('asset.capitalised', asset.id);
    expect(emitted?.payload).toMatchObject({
      assetTag: asset.assetTag,
      currency: 'BDT',
      purchaseCost: '1000.50',
      fxRateToBdt: '1.000000',
      purchaseCostBdt: '1000.50',
      departmentId,
      actorUserId: finance.user.id,
    });
  });

  it('converts a foreign cost once, at the rate in force today, and never again', async () => {
    rateId = (
      await prisma.exchangeRate.create({
        data: {
          base: 'USD',
          quote: 'BDT',
          rate: '122.5',
          effectiveFrom: parseDateOnly(daysAgo(10)),
          createdBy: finance.user.id,
        },
      })
    ).id;
    const asset = await costly({ purchaseCost: '100.10', currency: 'USD' });
    const res = await post('capitalise', asset.id);
    expect(res.body).toMatchObject({
      purchaseCost: '100.10',
      currency: 'USD',
      fxRateToBdt: '122.500000',
      purchaseCostBdt: '12262.25',
    });
    await prisma.exchangeRate.update({ where: { id: rateId }, data: { rate: '200' } });
    expect(
      (await request(app).get(`/api/assets/${asset.id}`).set(finance.header)).body.purchaseCostBdt,
    ).toBe('12262.25');
  });

  it('stops with a 409 naming the currency and date when no rate covers today, and never assumes one', async () => {
    const saved = rateId;
    await prisma.exchangeRate.delete({ where: { id: rateId! } });
    rateId = null;
    const asset = await costly({ purchaseCost: '10', currency: 'USD' });
    const res = await post('capitalise', asset.id);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/USD→BDT/);
    expect(
      (await prisma.asset.findUniqueOrThrow({ where: { id: asset.id } })).capitalisedAt,
    ).toBeNull();
    expect(saved).not.toBeNull();
  });

  it('needs a cost and a purchase date, happens once, and leaves a consumable to be expensed', async () => {
    const bare = await makeAsset(app, hr.header, category.id);
    expect((await post('capitalise', bare.id)).status).toBe(400);
    const asset = await costly();
    expect((await post('capitalise', asset.id)).status).toBe(200);
    const again = await post('capitalise', asset.id);
    expect(again.status).toBe(409);
    expect(again.body.error).toMatch(/already capitalised/);
    const mouse = await makeAsset(app, hr.header, supply.id, {
      purchaseCost: '500',
      purchaseDate: '2026-01-15',
    });
    expect((await post('capitalise', mouse.id)).status).toBe(409);
  });

  it('freezes the cost and currency once capitalised, so a later edit cannot rewrite the basis', async () => {
    const asset = await costly();
    await post('capitalise', asset.id);
    expect(
      (
        await request(app)
          .patch(`/api/assets/${asset.id}`)
          .set(hr.header)
          .send({ purchaseCost: '1' })
      ).status,
    ).toBe(409);
    expect(
      (await request(app).patch(`/api/assets/${asset.id}`).set(hr.header).send({ name: 'Renamed' }))
        .status,
    ).toBe(200);
  });

  it('is serialised, so two clicks capitalise once', async () => {
    const asset = await costly();
    const results = await Promise.all([post('capitalise', asset.id), post('capitalise', asset.id)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(
      await prisma.outboxEvent.count({
        where: { type: 'asset.capitalised', payload: { path: ['assetId'], equals: asset.id } },
      }),
    ).toBe(1);
  });
});

describe('paying for an asset', () => {
  it('needs it capitalised first, records the payment once and emits asset.paid', async () => {
    const asset = await costly();
    expect((await post('pay', asset.id)).status).toBe(409);
    await post('capitalise', asset.id);
    const res = await post('pay', asset.id, finance, { paidAt: '2026-02-01' });
    expect(res.status).toBe(200);
    expect(res.body.paid).toBe(true);
    expect(
      (await prisma.asset.findUniqueOrThrow({ where: { id: asset.id } })).paidAt?.toISOString(),
    ).toBe('2026-02-01T00:00:00.000Z');
    expect((await post('pay', asset.id)).status).toBe(409);
    expect((await event('asset.paid', asset.id))?.payload).toMatchObject({
      purchaseCostBdt: '1000.50',
      paidOn: '2026-02-01',
    });
    expect((await post('pay', asset.id, hr)).status).toBe(403);
  });
});

describe('disposing of an asset', () => {
  it('needs it capitalised, free of any holder, and not already gone', async () => {
    const never = await costly();
    expect((await post('dispose', never.id)).status).toBe(409);
    const held = await costly();
    await post('capitalise', held.id);
    await request(app)
      .post(`/api/assets/${held.id}/assign`)
      .set(hr.header)
      .send({ employeeId: alice.employee.id, conditionOut: 'GOOD' });
    const blocked = await post('dispose', held.id);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toMatch(/Take the asset back/);
    await request(app)
      .post(`/api/assets/${held.id}/return`)
      .set(hr.header)
      .send({ conditionIn: 'GOOD' });
    expect((await post('dispose', held.id, finance, { note: 'Sold' })).status).toBe(200);
    expect((await post('dispose', held.id)).status).toBe(409);
  });

  it('will not retire a capitalised asset the ordinary way, so a disposal is never skipped', async () => {
    const asset = await costly({ purchaseCost: '400' });
    await post('capitalise', asset.id);
    const res = await post('retire', asset.id, hr, { note: 'bin it' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/dispose/i);
    expect((await prisma.asset.findUniqueOrThrow({ where: { id: asset.id } })).lifecycle).not.toBe(
      'RETIRED',
    );
  });

  it('retires the asset and emits the cost, depreciation to date, proceeds and the gain or loss', async () => {
    const asset = await costly({ purchaseCost: '1000' });
    await post('capitalise', asset.id);
    const res = await post('dispose', asset.id, finance, {
      proceeds: '300.25',
      note: 'Sold to staff',
    });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('RETIRED');
    expect(
      (await request(app).get(`/api/assets/${asset.id}`).set(hr.header)).body.retirementNote,
    ).toBe('Sold to staff');
    expect((await event('asset.disposed', asset.id))?.payload).toMatchObject({
      purchaseCostBdt: '1000.00',
      accumulatedBdt: '0.00',
      bookValueBdt: '1000.00',
      proceedsBdt: '300.25',
      gainLossBdt: '-699.75',
    });
  });

  it('reports a gain when the proceeds beat the book value', async () => {
    const asset = await costly({ purchaseCost: '1000' });
    await post('capitalise', asset.id);
    await post('dispose', asset.id, finance, { proceeds: '1200' });
    expect((await event('asset.disposed', asset.id))?.payload).toMatchObject({
      gainLossBdt: '200.00',
    });
  });

  it('writes off a lost but capitalised asset, so it does not stay on the books', async () => {
    const asset = await costly({ purchaseCost: '1000' });
    await post('capitalise', asset.id);
    await request(app)
      .post(`/api/assets/${asset.id}/mark-lost`)
      .set(hr.header)
      .send({ note: 'Stolen' });
    expect((await post('dispose', asset.id)).status).toBe(200);
  });
});
