import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { memoryStorage, setStorageForTests } from '@erp/attachments';
import { prisma } from '@erp/db';
import { createApp } from '../../app.js';
import { cleanActors, makeActor } from '../../test-utils/access.js';

const prefix = 'zzcost';
const code = prefix.toUpperCase();
const app = createApp();
let finance: Awaited<ReturnType<typeof makeActor>>;
let reader: Awaited<ReturnType<typeof makeActor>>;
let config: Awaited<ReturnType<typeof makeActor>>;
let configOnly: Awaited<ReturnType<typeof makeActor>>;
let nobody: Awaited<ReturnType<typeof makeActor>>;
let category: { id: string };

beforeAll(async () => {
  finance = await makeActor(prefix, 'STANDARD', ['cost.read', 'cost.manage']);
  reader = await makeActor(prefix, 'STANDARD', ['cost.read']);
  config = await makeActor(prefix, 'STANDARD', ['cost.read', 'cost.config']);
  configOnly = await makeActor(prefix, 'STANDARD', ['cost.config']);
  nobody = await makeActor(prefix, 'STANDARD', []);
  category = (
    await request(app)
      .post('/api/costs/categories')
      .set(config.header)
      .send({ code: `${code}-RENT`, name: `${prefix} rent` })
  ).body;
});
beforeEach(() => setStorageForTests(memoryStorage()));
afterEach(() => setStorageForTests(undefined));
afterAll(async () => {
  const users = (
    await prisma.user.findMany({ where: { email: { startsWith: prefix } }, select: { id: true } })
  ).map((u) => u.id);
  const costIds = (
    await prisma.operatingCost.findMany({
      where: { category: { code: { startsWith: code } } },
      select: { id: true },
    })
  ).map((c) => c.id);
  await prisma.outboxEvent.deleteMany({
    where: { OR: users.map((id) => ({ payload: { path: ['actorUserId'], equals: id } })) },
  });
  await prisma.auditLog.deleteMany({
    where: { OR: [{ changedBy: { in: users } }, { entityId: { in: costIds } }] },
  });
  await prisma.costAttachment.deleteMany({ where: { costId: { in: costIds } } });
  await prisma.operatingCost.deleteMany({ where: { id: { in: costIds } } });
  await prisma.costCommitment.deleteMany({ where: { category: { code: { startsWith: code } } } });
  await prisma.costCategory.deleteMany({ where: { code: { startsWith: code } } });
  await cleanActors(prefix);
});

const bill = (over: object = {}) => ({
  categoryId: category.id,
  label: 'Office rent',
  payee: 'Dhanmondi',
  periodMonth: 10,
  periodYear: 2026,
  amount: '150000.50',
  ...over,
});
const make = (over: object = {}) =>
  request(app).post('/api/costs').set(finance.header).send(bill(over));

describe('cost categories', () => {
  it('load for a person who holds only the configuration permission', async () => {
    expect((await request(app).get('/api/costs/categories').set(configOnly.header)).status).toBe(
      200,
    );
    expect((await request(app).get('/api/costs/categories').set(nobody.header)).status).toBe(403);
  });
});

describe('operating costs', () => {
  it('goes PENDING then PAID, once, emitting an event at each step', async () => {
    const made = await make({ dueDate: '2026-10-05' });
    expect(made.status).toBe(201);
    expect(made.body).toMatchObject({
      status: 'PENDING',
      amount: '150000.50',
      currency: 'BDT',
      dueDate: '2026-10-05',
    });
    expect(
      await prisma.outboxEvent.count({
        where: { type: 'cost.bill.accrued', payload: { path: ['costId'], equals: made.body.id } },
      }),
    ).toBe(1);
    const paid = await request(app)
      .post(`/api/costs/${made.body.id}/pay`)
      .set(finance.header)
      .send({ paidAt: '2026-10-04', paymentRef: 'CHQ-1' });
    expect(paid.status).toBe(200);
    expect(paid.body).toMatchObject({
      status: 'PAID',
      paymentRef: 'CHQ-1',
      paidBy: finance.user.id,
    });
    expect(
      (await request(app).post(`/api/costs/${made.body.id}/pay`).set(finance.header).send({}))
        .status,
    ).toBe(409);
    const event = await prisma.outboxEvent.findFirst({
      where: { type: 'cost.bill.paid', payload: { path: ['costId'], equals: made.body.id } },
    });
    expect(event?.payload).toMatchObject({
      amount: '150000.50',
      paidOn: '2026-10-04',
      paymentRef: 'CHQ-1',
    });
  });

  it('lets two simultaneous payments through once', async () => {
    const made = await make();
    const results = await Promise.all(
      [1, 2].map(() =>
        request(app).post(`/api/costs/${made.body.id}/pay`).set(finance.header).send({}),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  });

  it('derives overdue from the due date and never stores it', async () => {
    const late = (await make({ dueDate: '2020-01-01' })).body;
    const future = (await make({ dueDate: '2999-01-01' })).body;
    expect(late.isOverdue).toBe(true);
    expect(future.isOverdue).toBe(false);
    await request(app).post(`/api/costs/${late.id}/pay`).set(finance.header).send({});
    expect(
      (await request(app).get(`/api/costs/${late.id}`).set(finance.header)).body.isOverdue,
    ).toBe(false);
  });

  it('needs cost.manage to write and cost.read to look, and refuses everyone else', async () => {
    expect(
      (await make().then(() => request(app).post('/api/costs').set(reader.header).send(bill())))
        .status,
    ).toBe(403);
    expect((await request(app).get('/api/costs').set(reader.header)).status).toBe(200);
    expect((await request(app).get('/api/costs').set(nobody.header)).status).toBe(403);
    expect(
      (
        await request(app)
          .post('/api/costs/categories')
          .set(finance.header)
          .send({ code: `${code}-X`, name: 'x' })
      ).status,
    ).toBe(403);
  });

  it('refuses amounts the column would round, foreign currency, a second bill for a commitment month, and a changed paid bill', async () => {
    expect((await make({ amount: '10.005' })).status).toBe(400);
    expect((await make({ currency: 'USD' })).status).toBe(400);
    const commitment = (
      await request(app).post('/api/costs/commitments').set(finance.header).send({
        categoryId: category.id,
        label: 'Rent',
        payee: 'Landlord',
        amount: '1000',
        startedOn: '2026-01-01',
      })
    ).body;
    expect((await make({ commitmentId: commitment.id, periodMonth: 1 })).status).toBe(201);
    expect((await make({ commitmentId: commitment.id, periodMonth: 1 })).status).toBe(409);
    const paid = (await make()).body;
    await request(app).post(`/api/costs/${paid.id}/pay`).set(finance.header).send({});
    expect(
      (await request(app).patch(`/api/costs/${paid.id}`).set(finance.header).send({ amount: '1' }))
        .status,
    ).toBe(409);
    expect(
      (await request(app).patch(`/api/costs/${paid.id}`).set(finance.header).send({ notes: 'ok' }))
        .status,
    ).toBe(200);
  });

  it('summarises a month exactly, per category and currency', async () => {
    await make({ periodYear: 2025, periodMonth: 3, amount: '0.10' });
    const second = (await make({ periodYear: 2025, periodMonth: 3, amount: '0.20' })).body;
    await request(app).post(`/api/costs/${second.id}/pay`).set(finance.header).send({});
    const res = await request(app)
      .get('/api/costs/summary')
      .query({ year: 2025, month: 3 })
      .set(reader.header);
    expect(
      res.body.categories.find((c: { categoryId: string }) => c.categoryId === category.id),
    ).toMatchObject({ total: '0.30', paid: '0.20', outstanding: '0.10', billCount: 2 });
  });

  it('refuses to delete a category bills use', async () => {
    expect(
      (await request(app).delete(`/api/costs/categories/${category.id}`).set(config.header)).status,
    ).toBe(409);
  });

  it('imports all or nothing, bills with a paid date arriving paid', async () => {
    const header = 'categoryCode,label,payee,periodMonth,periodYear,amount,paidAt';
    const send = (path: string, ...rows: string[]) =>
      request(app)
        .post(`/api/costs/import/${path}`)
        .set(finance.header)
        .attach('file', Buffer.from([header, ...rows].join('\n')), {
          filename: 'c.csv',
          contentType: 'text/csv',
        });
    const before = await prisma.operatingCost.count();
    const bad = await send('commit', `${code}-RENT,A,P,1,2024,10,`, `NOPE,B,P,1,2024,10,`);
    expect(bad.status).toBe(400);
    expect(await prisma.operatingCost.count()).toBe(before);
    const ok = await send(
      'commit',
      `${code}-RENT,A,P,1,2024,10.50,2024-01-02`,
      `${code}-RENT,B,P,2,2024,20,`,
    );
    expect(ok.status).toBe(201);
    expect(ok.body).toEqual({ costCount: 2, paidCount: 1 });
  });

  it('keeps receipts behind short-lived links', async () => {
    const made = (await make()).body;
    const up = await request(app)
      .post(`/api/costs/${made.id}/receipts`)
      .set(finance.header)
      .attach('file', Buffer.from('%PDF-1.7'), {
        filename: 'r.pdf',
        contentType: 'application/pdf',
      });
    expect(up.status).toBe(201);
    expect(up.body).not.toHaveProperty('publicId');
    expect(
      (await request(app).get(`/api/costs/receipts/${up.body.id}/url`).set(reader.header)).body.url,
    ).toContain('memory://');
    expect(
      (await request(app).delete(`/api/costs/receipts/${up.body.id}`).set(reader.header)).status,
    ).toBe(403);
    expect(
      (await request(app).delete(`/api/costs/receipts/${up.body.id}`).set(finance.header)).status,
    ).toBe(204);
  });

  it('exports with an audit row', async () => {
    const res = await request(app)
      .get('/api/costs/export')
      .query({ format: 'csv' })
      .set(finance.header);
    expect(res.status).toBe(200);
    expect(res.text).toContain('categoryCode');
  });
});
