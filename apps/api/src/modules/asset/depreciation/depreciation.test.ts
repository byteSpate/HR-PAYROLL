import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '@erp/db';
import { createApp } from '../../../app.js';
import { makeActor } from '../../../test-utils/access.js';
import {
  cleanAssetData,
  hireActor,
  makeAsset,
  makeCategory,
  makeDepartment,
} from '../asset.fixtures.js';

const prefix = 'zzdepr';
const app = createApp();
let departmentId: string;
let hr: Awaited<ReturnType<typeof hireActor>>;
let finance: Awaited<ReturnType<typeof hireActor>>;
let valuer: Awaited<ReturnType<typeof makeActor>>;
let config: Awaited<ReturnType<typeof makeActor>>;
let category: { id: string };
let noRate: { id: string };
let asset: { id: string };

// The run months sit far in the past so the test owns them whatever else is in the database.
const YEAR = 2031;

beforeAll(async () => {
  departmentId = (await makeDepartment(prefix)).id;
  hr = await hireActor(prefix, departmentId, ['asset.read:all', 'asset.manage:all']);
  finance = await hireActor(prefix, departmentId, [
    'asset.read:all',
    'asset.capitalise',
    'asset.value',
  ]);
  valuer = await makeActor(prefix, 'STANDARD', ['asset.value']);
  config = await makeActor(prefix, 'STANDARD', ['asset.config']);
  category = await makeCategory(app, config.header, prefix, { depreciationRate: '20' });
  noRate = await makeCategory(app, config.header, prefix);
  asset = await makeAsset(app, hr.header, category.id, {
    purchaseCost: '120000',
    purchaseDate: `${YEAR}-07-01`,
    departmentId,
  });
  expect(
    (await request(app).post(`/api/assets/${asset.id}/capitalise`).set(finance.header)).status,
  ).toBe(200);
});
afterAll(async () => {
  await prisma.depreciationRun.deleteMany({ where: { year: { gte: YEAR } } });
  await cleanAssetData(prefix, [departmentId]);
});

const draft = (year: number, month: number, who = finance) =>
  request(app).post('/api/depreciation').set(who.header).send({ year, month });
const post = (id: string, who = finance) =>
  request(app).post(`/api/depreciation/${id}/post`).set(who.header).send({});
const eventOf = (type: string, runId: string) =>
  prisma.outboxEvent.findFirst({ where: { type, payload: { path: ['runId'], equals: runId } } });

describe('depreciation runs', () => {
  it('need asset.capitalise, and nothing else gets in', async () => {
    expect((await draft(YEAR, 7, hr)).status).toBe(403);
    expect((await request(app).get('/api/depreciation').set(valuer.header)).status).toBe(403);
  });

  it('draft a month’s charge: a twelfth of the yearly rate on cost, to the cent', async () => {
    const res = await draft(YEAR, 7);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: 'DRAFT', year: YEAR, month: 7 });
    expect(res.body.runNo).toMatch(/^BS-DEP-\d{5}$/);
    const charge = res.body.charges.find((c: { assetId: string }) => c.assetId === asset.id);
    expect(charge).toMatchObject({
      amount: '2000.00',
      openingBookValue: '120000.00',
      rate: '20.00',
      months: 1,
    });
    expect((await draft(YEAR, 7)).status).toBe(409);
    expect(
      (await request(app).delete(`/api/depreciation/${res.body.id}`).set(finance.header)).status,
    ).toBe(204);
  });

  it('refuse a later month while an earlier one is still a draft', async () => {
    const first = (await draft(YEAR, 7)).body;
    const blocked = await draft(YEAR, 8);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toMatch(/still a draft/);
    const preflight = await request(app)
      .get('/api/depreciation/preflight')
      .query({ year: YEAR, month: 8 })
      .set(finance.header);
    expect(preflight.body).toMatchObject({
      ok: false,
      blockers: [expect.objectContaining({ code: 'EARLIER_UNPOSTED' })],
    });
    await post(first.id);
  });

  it('finalise once, emitting the totals by category and department', async () => {
    const run = (
      await request(app).get('/api/depreciation').query({ year: YEAR }).set(finance.header)
    ).body.find((r: { month: number }) => r.month === 7);
    expect(run.status).toBe('POSTED');
    expect(await post(run.id).then((r) => r.status)).toBe(409);
    const event = await eventOf('depreciation.run.finalized', run.id);
    expect(event?.payload).toMatchObject({
      runNo: run.runNo,
      year: YEAR,
      month: 7,
      totalBdt: '2000.00',
      lines: [{ departmentId, amountBdt: '2000.00' }],
    });
  });

  it('refuse an earlier month once a later one stands, so no month is charged twice', async () => {
    const res = await draft(YEAR, 6);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already covers a later month/);
  });

  it('build on what is posted: the next month is charged on the same opening value', async () => {
    const next = await draft(YEAR, 8);
    expect(next.status).toBe(201);
    expect(
      next.body.charges.find((c: { assetId: string }) => c.assetId === asset.id),
    ).toMatchObject({ amount: '2000.00', openingBookValue: '120000.00' });
    await post(next.body.id);
  });

  it('reverse only the latest posted run, with a reason, and free its month', async () => {
    const runs = (
      await request(app).get('/api/depreciation').query({ year: YEAR }).set(finance.header)
    ).body;
    const july = runs.find((r: { month: number }) => r.month === 7);
    const august = runs.find((r: { month: number }) => r.month === 8);
    expect(
      (
        await request(app)
          .post(`/api/depreciation/${july.id}/reverse`)
          .set(finance.header)
          .send({ reason: 'x' })
      ).status,
    ).toBe(409);
    expect(
      (
        await request(app)
          .post(`/api/depreciation/${august.id}/reverse`)
          .set(finance.header)
          .send({})
      ).status,
    ).toBe(400);
    const res = await request(app)
      .post(`/api/depreciation/${august.id}/reverse`)
      .set(finance.header)
      .send({ reason: 'Wrong rate' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('REVERSED');
    expect(
      (
        await prisma.auditLog.findFirst({
          where: { entity: 'DEPRECIATION_RUN', entityId: august.id, action: 'CANCEL' },
        })
      )?.note,
    ).toBe('Wrong rate');
    const again = await draft(YEAR, 8);
    expect(again.status).toBe(201);
    await request(app).delete(`/api/depreciation/${again.body.id}`).set(finance.header);
  });

  it('refuse to draft while a capitalised category has no rate', async () => {
    const bare = await makeAsset(app, hr.header, noRate.id, {
      purchaseCost: '5000',
      purchaseDate: `${YEAR}-07-01`,
    });
    await request(app).post(`/api/assets/${bare.id}/capitalise`).set(finance.header);
    const res = await draft(YEAR, 9);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/no depreciation rate/);
  });
});

describe('asset value', () => {
  it('is cost less posted charges, per asset and per currency, and left to asset.value', async () => {
    expect((await request(app).get('/api/assets/value').set(hr.header)).status).toBe(403);
    const res = await request(app)
      .get('/api/assets/value')
      .query({ asOf: `${YEAR}-12-31` })
      .set(valuer.header);
    expect(res.status).toBe(200);
    const row = res.body.rows.find((r: { assetId: string }) => r.assetId === asset.id);
    expect(row).toMatchObject({
      status: 'VALUED',
      purchaseCost: '120000.00',
      accumulated: '2000.00',
      bookValue: '118000.00',
    });
    const before = await request(app)
      .get('/api/assets/value')
      .query({ asOf: `${YEAR}-06-30` })
      .set(valuer.header);
    expect(before.body.rows.find((r: { assetId: string }) => r.assetId === asset.id)).toMatchObject(
      { accumulated: '0.00', bookValue: '120000.00' },
    );
  });

  it('reads the register as it stood: not yet capitalised is not valued, and a disposal removes the asset after its date', async () => {
    const early = await request(app)
      .get('/api/assets/value')
      .query({ asOf: '2020-01-01' })
      .set(valuer.header);
    expect(early.body.rows.find((r: { assetId: string }) => r.assetId === asset.id)).toMatchObject({
      status: 'NOT_CAPITALISED',
      bookValue: null,
    });
    const gone = await makeAsset(app, hr.header, category.id, {
      purchaseCost: '500',
      purchaseDate: `${YEAR}-07-01`,
    });
    await request(app).post(`/api/assets/${gone.id}/capitalise`).set(finance.header);
    await request(app).post(`/api/assets/${gone.id}/dispose`).set(finance.header).send({});
    const ids = (r: { body: { rows: { assetId: string }[] } }) => r.body.rows.map((x) => x.assetId);
    expect(
      ids(
        await request(app)
          .get('/api/assets/value')
          .query({ asOf: '2020-01-01' })
          .set(valuer.header),
      ),
    ).toContain(gone.id);
    expect(ids(await request(app).get('/api/assets/value').set(valuer.header))).not.toContain(
      gone.id,
    );
  });

  it('shows what cannot be valued as unknown and keeps it out of the totals', async () => {
    const loose = await makeAsset(app, hr.header, category.id, { purchaseCost: '777' });
    const res = await request(app).get('/api/assets/value').set(valuer.header);
    expect(res.body.rows.find((r: { assetId: string }) => r.assetId === loose.id)).toMatchObject({
      status: 'NOT_CAPITALISED',
      bookValue: null,
    });
    expect(
      res.body.totals.every((t: { bookValue: string }) => !Number.isNaN(Number(t.bookValue))),
    ).toBe(true);
  });

  it('feeds a disposal: depreciation to date comes off the book value that is written off', async () => {
    const res = await request(app)
      .post(`/api/assets/${asset.id}/dispose`)
      .set(finance.header)
      .send({ proceeds: '100000' });
    expect(res.status).toBe(200);
    const event = await prisma.outboxEvent.findFirst({
      where: { type: 'asset.disposed', payload: { path: ['assetId'], equals: asset.id } },
    });
    expect(event?.payload).toMatchObject({
      accumulatedBdt: '2000.00',
      bookValueBdt: '118000.00',
      gainLossBdt: '-18000.00',
    });
  });
});
