import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '@erp/db';
import { createApp } from '../../app.js';
import { cleanActors, makeActor } from '../../test-utils/access.js';

const prefix = 'zzexchange';
const app = createApp();
let config: Awaited<ReturnType<typeof makeActor>>;
let plain: Awaited<ReturnType<typeof makeActor>>;
const made: string[] = [];

// Dates far from real data, so the shared test database never collides with another file.
const body = (over: object = {}) => ({ base: 'USD', quote: 'BDT', rate: 122.5, effectiveFrom: '2031-03-01', ...over });

beforeAll(async () => {
  config = await makeActor(prefix, 'STANDARD', ['exchange.config']);
  plain = await makeActor(prefix, 'STANDARD');
});
afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { entity: 'EXCHANGE_RATE', entityId: { in: made } } });
  await prisma.exchangeRate.deleteMany({ where: { id: { in: made } } });
  await cleanActors(prefix);
});

describe('exchange rate routes', () => {
  it('lets any signed-in person read the rates, since a payslip quotes one, but not change them', async () => {
    expect((await request(app).get('/api/exchange-rates')).status).toBe(401);
    expect((await request(app).get('/api/exchange-rates').set(plain.header)).status).toBe(200);
    expect((await request(app).post('/api/exchange-rates').set(plain.header).send(body())).status).toBe(403);
  });

  it('creates a rate with six decimals, newest effective date first, and audits it', async () => {
    const created = await request(app).post('/api/exchange-rates').set(config.header).send(body({ rate: 122.456789 }));
    expect(created.status).toBe(201);
    made.push(created.body.id);
    expect(created.body).toMatchObject({ base: 'USD', quote: 'BDT', rate: '122.456789', effectiveFrom: '2031-03-01', createdBy: config.user.id });
    const later = await request(app).post('/api/exchange-rates').set(config.header).send(body({ effectiveFrom: '2031-04-01' }));
    made.push(later.body.id);
    const listed = await request(app).get('/api/exchange-rates').set(plain.header);
    const ids = listed.body.map((r: { id: string }) => r.id);
    expect(ids.indexOf(later.body.id)).toBeLessThan(ids.indexOf(created.body.id));
    expect(await prisma.auditLog.count({ where: { entity: 'EXCHANGE_RATE', entityId: created.body.id, action: 'CREATE' } })).toBe(1);
  });

  it('refuses a second rate for the same pair and day with 409, and bad input with 400', async () => {
    const first = await request(app).post('/api/exchange-rates').set(config.header).send(body({ effectiveFrom: '2031-05-01' }));
    made.push(first.body.id);
    expect((await request(app).post('/api/exchange-rates').set(config.header).send(body({ effectiveFrom: '2031-05-01' }))).status).toBe(409);
    expect((await request(app).post('/api/exchange-rates').set(config.header).send(body({ quote: 'USD' }))).status).toBe(400);
    expect((await request(app).post('/api/exchange-rates').set(config.header).send(body({ rate: -1 }))).status).toBe(400);
  });

  it('edits a rate with before and after in the audit log, and 404s an unknown id', async () => {
    const row = await request(app).post('/api/exchange-rates').set(config.header).send(body({ effectiveFrom: '2031-06-01' }));
    made.push(row.body.id);
    const edited = await request(app).patch(`/api/exchange-rates/${row.body.id}`).set(config.header).send(body({ effectiveFrom: '2031-06-01', rate: 123 }));
    expect(edited.status).toBe(200);
    expect(edited.body.rate).toBe('123.000000');
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { entity: 'EXCHANGE_RATE', entityId: row.body.id, action: 'UPDATE' } });
    expect(audit.before).toMatchObject({ rate: '122.500000' });
    expect(audit.after).toMatchObject({ rate: '123.000000' });
    expect((await request(app).patch('/api/exchange-rates/00000000-0000-0000-0000-000000000000').set(config.header).send(body())).status).toBe(404);
    expect((await request(app).patch(`/api/exchange-rates/${row.body.id}`).set(plain.header).send(body())).status).toBe(403);
  });
});
