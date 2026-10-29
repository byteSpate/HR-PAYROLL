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

const prefix = 'zzassetrep';
const app = createApp();
let departmentId: string;
let alice: Awaited<ReturnType<typeof hireActor>>;
let hr: Awaited<ReturnType<typeof hireActor>>;
let category: { id: string };

beforeAll(async () => {
  departmentId = (await makeDepartment(prefix)).id;
  alice = await hireActor(prefix, departmentId);
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

const send = (id: string, body: object = { fault: 'Screen flickers' }, who = hr) =>
  request(app).post(`/api/assets/${id}/repairs`).set(who.header).send(body);
const receive = (id: string, body: object = {}, who = hr) =>
  request(app).post(`/api/assets/repairs/${id}/receive`).set(who.header).send(body);

describe('repairs', () => {
  it('send an asset out without ending custody, so a holder stays responsible while it is away', async () => {
    const asset = await makeAsset(app, hr.header, category.id);
    await request(app)
      .post(`/api/assets/${asset.id}/assign`)
      .set(hr.header)
      .send({ employeeId: alice.employee.id, conditionOut: 'GOOD' });
    expect((await send(asset.id, { fault: 'x' }, alice)).status).toBe(403);
    const res = await send(asset.id, {
      fault: 'Screen flickers',
      vendor: 'Star Tech',
      expectedBack: '2026-12-01',
      isWarranty: true,
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      fault: 'Screen flickers',
      vendor: 'Star Tech',
      expectedBack: '2026-12-01',
      isWarranty: true,
      returnedAt: null,
    });
    const read = await request(app).get(`/api/assets/${asset.id}`).set(hr.header);
    expect(read.body).toMatchObject({
      status: 'IN_REPAIR',
      heldBy: { employeeId: alice.employee.id },
    });
  });

  it('allow one open repair at a time, and none for a retired or lost asset', async () => {
    const asset = await makeAsset(app, hr.header, category.id);
    expect((await send(asset.id)).status).toBe(201);
    const second = await send(asset.id);
    expect(second.status).toBe(409);
    expect(second.body.error).toMatch(/already has an open repair/);
    const gone = await makeAsset(app, hr.header, category.id);
    await request(app).post(`/api/assets/${gone.id}/retire`).set(hr.header).send({ note: 'old' });
    expect((await send(gone.id)).status).toBe(409);
  });

  it('come back with a cost kept to the cent, an outcome and a condition, and close once', async () => {
    const asset = await makeAsset(app, hr.header, category.id);
    const repair = (await send(asset.id)).body;
    expect(
      (
        await receive(
          repair.id,
          { cost: '1234.5', outcome: 'New panel', conditionAfter: 'GOOD' },
          alice,
        )
      ).status,
    ).toBe(403);
    expect((await receive(repair.id, { cost: '1.005' })).status).toBe(400);
    const res = await receive(repair.id, {
      cost: '1234.5',
      currency: 'BDT',
      outcome: 'New panel',
      conditionAfter: 'GOOD',
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      cost: '1234.50',
      outcome: 'New panel',
      conditionAfter: 'GOOD',
    });
    expect(res.body.returnedAt).not.toBeNull();
    expect((await receive(repair.id)).status).toBe(409);
    expect((await request(app).get(`/api/assets/${asset.id}`).set(hr.header)).body.status).toBe(
      'AVAILABLE',
    );
  });

  it('are listed, optionally only the open ones, for whoever manages assets', async () => {
    const asset = await makeAsset(app, hr.header, category.id);
    const open = (await send(asset.id)).body;
    expect((await request(app).get('/api/assets/repairs').set(alice.header)).status).toBe(403);
    const all = await request(app).get('/api/assets/repairs').set(hr.header);
    expect(all.body.map((r: { id: string }) => r.id)).toContain(open.id);
    expect(all.body.find((r: { id: string }) => r.id === open.id).asset).toMatchObject({
      assetTag: asset.assetTag,
    });
    await receive(open.id);
    const stillOpen = await request(app)
      .get('/api/assets/repairs')
      .query({ open: 'true' })
      .set(hr.header);
    expect(stillOpen.body.map((r: { id: string }) => r.id)).not.toContain(open.id);
  });

  it('record who sent them in the audit trail', async () => {
    const asset = await makeAsset(app, hr.header, category.id);
    const repair = (await send(asset.id)).body;
    expect(
      (
        await prisma.auditLog.findFirst({
          where: { entity: 'ASSET_REPAIR', entityId: repair.id, action: 'SEND_REPAIR' },
        })
      )?.changedBy,
    ).toBe(hr.user.id);
  });
});
