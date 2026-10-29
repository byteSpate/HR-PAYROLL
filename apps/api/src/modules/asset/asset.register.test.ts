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

const prefix = 'zzassetreg';
const app = createApp();
let departmentId: string;
let otherDepartmentId: string;
let manager: Awaited<ReturnType<typeof hireActor>>;
let alice: Awaited<ReturnType<typeof hireActor>>;
let bob: Awaited<ReturnType<typeof hireActor>>;
let hr: Awaited<ReturnType<typeof hireActor>>;
let finance: Awaited<ReturnType<typeof hireActor>>;
let deptManager: Awaited<ReturnType<typeof hireActor>>;
let config: Awaited<ReturnType<typeof makeActor>>;
let laptop: { id: string; code: string; name: string };
let chair: { id: string; code: string; name: string };

beforeAll(async () => {
  departmentId = (await makeDepartment(prefix)).id;
  otherDepartmentId = (await makeDepartment(prefix)).id;
  manager = await hireActor(prefix, departmentId, ['asset.read:team']);
  alice = await hireActor(prefix, departmentId, [], { managerEmployeeId: manager.employee.id });
  bob = await hireActor(prefix, otherDepartmentId);
  hr = await hireActor(prefix, otherDepartmentId, ['asset.read:all', 'asset.manage:all']);
  finance = await hireActor(prefix, otherDepartmentId, ['asset.read:all', 'asset.capitalise']);
  deptManager = await hireActor(prefix, departmentId, [
    'asset.read:department',
    'asset.manage:department',
  ]);
  config = await makeActor(prefix, 'STANDARD', ['asset.config']);
  laptop = await makeCategory(app, config.header, prefix, { requiresSerial: true });
  chair = await makeCategory(app, config.header, prefix, { classification: 'NON_IT' });
});
afterAll(async () => {
  await cleanAssetData(prefix, [departmentId, otherDepartmentId]);
});

const assign = (assetId: string, who: { employee: { id: string } }, by = hr) =>
  request(app)
    .post(`/api/assets/${assetId}/assign`)
    .set(by.header)
    .send({ employeeId: who.employee.id, conditionOut: 'GOOD' });

describe('asset categories', () => {
  it('lets any signed-in person list them, but only asset.config create, change or delete', async () => {
    expect((await request(app).get('/api/assets/categories').set(alice.header)).status).toBe(200);
    const body = {
      code: `${prefix.toUpperCase()}_MON`,
      name: `${prefix} Monitor`,
      classification: 'IT',
    };
    expect(
      (await request(app).post('/api/assets/categories').set(hr.header).send(body)).status,
    ).toBe(403);
    const made = await request(app).post('/api/assets/categories').set(config.header).send(body);
    expect(made.status).toBe(201);
    expect(made.body).toMatchObject({
      code: body.code,
      classification: 'IT',
      requiresSerial: true,
      tracksIndividually: true,
    });
    expect(
      (await request(app).post('/api/assets/categories').set(config.header).send(body)).status,
    ).toBe(409);
    expect(
      (
        await request(app)
          .patch(`/api/assets/categories/${made.body.id}`)
          .set(hr.header)
          .send({ name: 'x' })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .patch(`/api/assets/categories/${made.body.id}`)
          .set(config.header)
          .send({ isConsumable: true })
      ).body.isConsumable,
    ).toBe(true);
    expect(
      (await request(app).delete(`/api/assets/categories/${made.body.id}`).set(config.header))
        .status,
    ).toBe(204);
  });

  it('refuses a category nobody classified', async () => {
    const res = await request(app)
      .post('/api/assets/categories')
      .set(config.header)
      .send({ code: `${prefix.toUpperCase()}_NOCLASS`, name: `${prefix} unclassified` });
    expect(res.status).toBe(400);
  });

  it('will not let a category start requiring serials, or become a supply, while its assets say otherwise', async () => {
    const cat = await makeCategory(app, config.header, prefix, { requiresSerial: false });
    await makeAsset(app, hr.header, cat.id, { name: 'No serial' });
    const strict = await request(app)
      .patch(`/api/assets/categories/${cat.id}`)
      .set(config.header)
      .send({ requiresSerial: true });
    expect(strict.status).toBe(409);
    expect(strict.body.error).toMatch(/1 asset\(s\)/);
    const supply = await request(app)
      .patch(`/api/assets/categories/${cat.id}`)
      .set(config.header)
      .send({ tracksIndividually: false });
    expect(supply.status).toBe(409);
  });

  it('refuses to delete a category assets use, naming what uses it', async () => {
    const cat = await makeCategory(app, config.header, prefix);
    await makeAsset(app, hr.header, cat.id);
    const used = await request(app).delete(`/api/assets/categories/${cat.id}`).set(config.header);
    expect(used.status).toBe(409);
    expect(used.body.error).toMatch(/in use by 1 asset/);
  });
});

describe('registering an asset', () => {
  it('needs asset.manage, issues the next tag and records who did it', async () => {
    const body = { categoryId: chair.id, name: 'Standing desk' };
    expect((await request(app).post('/api/assets').set(alice.header).send(body)).status).toBe(403);
    expect((await request(app).post('/api/assets').set(manager.header).send(body)).status).toBe(
      403,
    );
    const a = await request(app).post('/api/assets').set(hr.header).send(body);
    const b = await request(app).post('/api/assets').set(hr.header).send(body);
    expect(a.status).toBe(201);
    expect(a.body.assetTag).toMatch(/^BS-AST-\d{5}$/);
    expect(Number(b.body.assetTag.slice(-5))).toBe(Number(a.body.assetTag.slice(-5)) + 1);
    const audit = await prisma.auditLog.findFirst({
      where: { entity: 'ASSET', entityId: a.body.id, action: 'CREATE' },
    });
    expect(audit?.changedBy).toBe(hr.user.id);
  });

  it('requires a serial where the category says so, and keeps serials and tags unique', async () => {
    expect(
      (
        await request(app)
          .post('/api/assets')
          .set(hr.header)
          .send({ categoryId: laptop.id, name: 'Dell' })
      ).status,
    ).toBe(400);
    const first = await request(app)
      .post('/api/assets')
      .set(hr.header)
      .send({ categoryId: laptop.id, name: 'Dell', serialNumber: `${prefix}-SN-1` });
    expect(first.status).toBe(201);
    expect(
      (
        await request(app)
          .post('/api/assets')
          .set(hr.header)
          .send({ categoryId: laptop.id, name: 'Dell 2', serialNumber: `${prefix}-SN-1` })
      ).status,
    ).toBe(409);
    expect(
      (
        await request(app)
          .post('/api/assets')
          .set(hr.header)
          .send({
            categoryId: laptop.id,
            name: 'Dell 3',
            serialNumber: `${prefix}-SN-3`,
            assetTag: first.body.assetTag,
          })
      ).status,
    ).toBe(409);
  });

  it('stores money exactly and refuses what the column would round', async () => {
    const ok = await request(app)
      .post('/api/assets')
      .set(hr.header)
      .send({
        categoryId: chair.id,
        name: 'Costly',
        purchaseCost: '95000.50',
        purchaseDate: '2026-01-15',
      });
    expect(ok.status).toBe(201);
    const read = await request(app).get(`/api/assets/${ok.body.id}`).set(hr.header);
    expect(read.body).toMatchObject({ purchaseCost: '95000.50', purchaseDate: '2026-01-15' });
    expect(
      (
        await request(app)
          .post('/api/assets')
          .set(hr.header)
          .send({ categoryId: chair.id, name: 'Rounded', purchaseCost: '10.005' })
      ).status,
    ).toBe(400);
  });

  it('records only the fields that changed, and nothing at all when none did', async () => {
    const made = await makeAsset(app, hr.header, chair.id, { name: 'Before', location: 'Store A' });
    const res = await request(app)
      .patch(`/api/assets/${made.id}`)
      .set(hr.header)
      .send({ name: 'After', location: 'Store A' });
    expect(res.status).toBe(200);
    const audits = await prisma.auditLog.findMany({
      where: { entity: 'ASSET', entityId: made.id, action: 'UPDATE' },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0]?.before).toEqual({ name: 'Before' });
    expect(audits[0]?.after).toEqual({ name: 'After' });
    await request(app).patch(`/api/assets/${made.id}`).set(hr.header).send({ name: 'After' });
    expect(
      await prisma.auditLog.count({
        where: { entity: 'ASSET', entityId: made.id, action: 'UPDATE' },
      }),
    ).toBe(1);
  });
});

describe('who sees which assets', () => {
  let held: { id: string; assetTag: string };
  let bobs: { id: string; assetTag: string };
  let unassigned: { id: string; assetTag: string };

  beforeAll(async () => {
    held = await makeAsset(app, hr.header, chair.id, {
      name: 'Alice chair',
      purchaseCost: '5000',
      vendor: 'Vendor X',
    });
    bobs = await makeAsset(app, hr.header, chair.id, { name: 'Bob chair' });
    unassigned = await makeAsset(app, hr.header, chair.id, { name: 'Spare chair' });
    expect((await assign(held.id, alice)).status).toBe(201);
    expect((await assign(bobs.id, bob)).status).toBe(201);
  });

  it('shows a person what they hold and nothing else, and 404s the rest by id', async () => {
    const mine = await request(app).get('/api/assets').set(alice.header);
    expect(mine.status).toBe(200);
    const ids = mine.body.map((a: { id: string }) => a.id);
    expect(ids).toContain(held.id);
    expect(ids).not.toContain(bobs.id);
    expect(ids).not.toContain(unassigned.id);
    expect((await request(app).get(`/api/assets/${held.id}`).set(alice.header)).status).toBe(200);
    expect((await request(app).get(`/api/assets/${bobs.id}`).set(alice.header)).status).toBe(404);
    expect((await request(app).get(`/api/assets/${unassigned.id}`).set(alice.header)).status).toBe(
      404,
    );
  });

  it('gives a team reader their reports’ holdings, and 404s an asset held outside the team', async () => {
    const ids = (await request(app).get('/api/assets').set(manager.header)).body.map(
      (a: { id: string }) => a.id,
    );
    expect(ids).toContain(held.id);
    expect(ids).not.toContain(bobs.id);
    expect((await request(app).get(`/api/assets/${bobs.id}`).set(manager.header)).status).toBe(404);
  });

  it('gives a reader of everything the whole register, and a department reader their department’s share', async () => {
    const all = (await request(app).get('/api/assets').set(hr.header)).body.map(
      (a: { id: string }) => a.id,
    );
    expect(all).toEqual(expect.arrayContaining([held.id, bobs.id, unassigned.id]));
    const dept = (await request(app).get('/api/assets').set(deptManager.header)).body.map(
      (a: { id: string }) => a.id,
    );
    expect(dept).toContain(held.id);
    expect(dept).not.toContain(bobs.id);
  });

  it('omits cost and vendor, rather than hiding them, for anyone who may not see them', async () => {
    const asEmployee = await request(app).get(`/api/assets/${held.id}`).set(alice.header);
    expect(asEmployee.body).not.toHaveProperty('purchaseCost');
    expect(asEmployee.body).not.toHaveProperty('vendor');
    expect((await request(app).get('/api/assets').set(manager.header)).body[0]).not.toHaveProperty(
      'purchaseCost',
    );
    for (const who of [hr, finance]) {
      const seen = await request(app).get(`/api/assets/${held.id}`).set(who.header);
      expect(seen.body).toMatchObject({ purchaseCost: '5000.00', vendor: 'Vendor X' });
    }
  });

  it('derives the status, which can be filtered on', async () => {
    const list = (
      await request(app).get('/api/assets').query({ status: 'AVAILABLE' }).set(hr.header)
    ).body;
    expect(list.map((a: { id: string }) => a.id)).toContain(unassigned.id);
    expect(list.map((a: { id: string }) => a.id)).not.toContain(held.id);
    const assigned = (
      await request(app).get('/api/assets').query({ status: 'ASSIGNED' }).set(hr.header)
    ).body;
    expect(assigned.find((a: { id: string }) => a.id === held.id)).toMatchObject({
      status: 'ASSIGNED',
      heldBy: { employeeId: alice.employee.id },
    });
    expect(
      (await request(app).get('/api/assets').query({ q: 'Spare chair' }).set(hr.header)).body.map(
        (a: { id: string }) => a.id,
      ),
    ).toEqual([unassigned.id]);
  });
});

describe('retiring an asset and marking it lost', () => {
  it('needs asset.manage and a note, and refuses an asset somebody still holds', async () => {
    const a = await makeAsset(app, hr.header, chair.id);
    expect(
      (
        await request(app)
          .post(`/api/assets/${a.id}/retire`)
          .set(alice.header)
          .send({ note: 'old' })
      ).status,
    ).toBe(403);
    expect(
      (await request(app).post(`/api/assets/${a.id}/retire`).set(hr.header).send({})).status,
    ).toBe(400);
    await assign(a.id, alice);
    const held = await request(app)
      .post(`/api/assets/${a.id}/retire`)
      .set(hr.header)
      .send({ note: 'worn out' });
    expect(held.status).toBe(409);
    expect(held.body.error).toMatch(/Take the asset back/);
  });

  it('retires a free asset once, recording who and why, and emits asset.retired', async () => {
    const a = await makeAsset(app, hr.header, chair.id);
    const res = await request(app)
      .post(`/api/assets/${a.id}/retire`)
      .set(hr.header)
      .send({ note: 'worn out' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('RETIRED');
    expect((await request(app).get(`/api/assets/${a.id}`).set(hr.header)).body).toMatchObject({
      status: 'RETIRED',
      retirementNote: 'worn out',
    });
    expect(
      (await request(app).post(`/api/assets/${a.id}/retire`).set(hr.header).send({ note: 'again' }))
        .status,
    ).toBe(409);
    expect(
      (
        await request(app)
          .post(`/api/assets/${a.id}/mark-lost`)
          .set(hr.header)
          .send({ note: 'lost' })
      ).status,
    ).toBe(409);
    const event = await prisma.outboxEvent.findFirst({
      where: { type: 'asset.retired', payload: { path: ['assetId'], equals: a.id } },
    });
    expect(event?.payload).toMatchObject({ assetTag: a.assetTag, note: 'worn out' });
  });

  it('marks a held asset lost without a return, prices a recovery against the holder, and emits asset.lost', async () => {
    const a = await makeAsset(app, hr.header, chair.id);
    await assign(a.id, alice);
    const res = await request(app)
      .post(`/api/assets/${a.id}/mark-lost`)
      .set(hr.header)
      .send({ note: 'stolen', recovery: { amount: '4000', reason: 'Left in a car' } });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('LOST');
    const recoveries = await prisma.assetRecovery.findMany({ where: { assetId: a.id } });
    expect(recoveries).toHaveLength(1);
    expect(recoveries[0]).toMatchObject({
      employeeId: alice.employee.id,
      kind: 'LOST',
      status: 'PENDING',
    });
    expect(recoveries[0]?.amount.toFixed(2)).toBe('4000.00');
    expect(
      await prisma.outboxEvent.count({
        where: { type: 'asset.lost', payload: { path: ['assetId'], equals: a.id } },
      }),
    ).toBe(1);
  });

  it('raises no recovery for a loss with nobody holding it', async () => {
    const a = await makeAsset(app, hr.header, chair.id);
    const res = await request(app)
      .post(`/api/assets/${a.id}/mark-lost`)
      .set(hr.header)
      .send({ note: 'gone from store', recovery: { amount: '10', reason: 'x' } });
    expect(res.status).toBe(200);
    expect(await prisma.assetRecovery.count({ where: { assetId: a.id } })).toBe(0);
  });

  it('rolls the loss back when the recovery behind it is refused', async () => {
    const a = await makeAsset(app, hr.header, chair.id);
    await assign(a.id, alice);
    const res = await request(app)
      .post(`/api/assets/${a.id}/mark-lost`)
      .set(hr.header)
      .send({ note: 'stolen', recovery: { amount: '0', reason: 'free' } });
    expect(res.status).toBe(400);
    expect((await prisma.asset.findUniqueOrThrow({ where: { id: a.id } })).lifecycle).toBe(
      'IN_SERVICE',
    );
  });
});
