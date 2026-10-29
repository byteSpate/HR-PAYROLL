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

const prefix = 'zzassetcus';
const app = createApp();
let departmentId: string;
let outsideId: string;
let alice: Awaited<ReturnType<typeof hireActor>>;
let bob: Awaited<ReturnType<typeof hireActor>>;
let hr: Awaited<ReturnType<typeof hireActor>>;
let deptManager: Awaited<ReturnType<typeof hireActor>>;
let category: { id: string };

beforeAll(async () => {
  departmentId = (await makeDepartment(prefix)).id;
  outsideId = (await makeDepartment(prefix)).id;
  alice = await hireActor(prefix, departmentId);
  bob = await hireActor(prefix, outsideId);
  hr = await hireActor(prefix, outsideId, ['asset.read:all', 'asset.manage:all']);
  deptManager = await hireActor(prefix, departmentId, [
    'asset.read:department',
    'asset.manage:department',
  ]);
  category = await makeCategory(
    app,
    (await makeActor(prefix, 'STANDARD', ['asset.config'])).header,
    prefix,
  );
});
afterAll(async () => {
  await cleanAssetData(prefix, [departmentId, outsideId]);
});

const assign = (assetId: string, who: { employee: { id: string } }, by = hr, body: object = {}) =>
  request(app)
    .post(`/api/assets/${assetId}/assign`)
    .set(by.header)
    .send({ employeeId: who.employee.id, conditionOut: 'GOOD', ...body });
const status = async (assetId: string) =>
  (await request(app).get(`/api/assets/${assetId}`).set(hr.header)).body.status;

describe('handing an asset over and taking it back', () => {
  it('moves it from AVAILABLE to ASSIGNED and back, keeping both ends of the story', async () => {
    const asset = await makeAsset(app, hr.header, category.id);
    expect(await status(asset.id)).toBe('AVAILABLE');
    const given = await assign(asset.id, alice, hr, {
      issueNote: 'With charger',
      conditionOut: 'NEW',
    });
    expect(given.status).toBe(201);
    expect(given.body).toMatchObject({
      employeeId: alice.employee.id,
      conditionOut: 'NEW',
      issueNote: 'With charger',
      acknowledgedAt: null,
      returnedAt: null,
      assignedBy: hr.user.id,
    });
    expect(await status(asset.id)).toBe('ASSIGNED');
    const back = await request(app)
      .post(`/api/assets/${asset.id}/return`)
      .set(hr.header)
      .send({ conditionIn: 'FAIR', returnNote: 'Scratched lid' });
    expect(back.status).toBe(200);
    expect(back.body).toMatchObject({
      conditionIn: 'FAIR',
      returnNote: 'Scratched lid',
      returnedTo: hr.user.id,
    });
    expect(await status(asset.id)).toBe('AVAILABLE');
    expect(await prisma.assetAssignment.count({ where: { assetId: asset.id } })).toBe(1);
    expect(
      await prisma.outboxEvent.count({
        where: { type: 'asset.assigned', payload: { path: ['assetId'], equals: asset.id } },
      }),
    ).toBe(1);
    expect(
      await prisma.outboxEvent.count({
        where: { type: 'asset.returned', payload: { path: ['assetId'], equals: asset.id } },
      }),
    ).toBe(1);
  });

  it('needs asset.manage, and a department manager reaches only their department’s assets', async () => {
    const asset = await makeAsset(app, hr.header, category.id);
    expect((await assign(asset.id, alice, alice)).status).toBe(403);
    expect((await assign(asset.id, alice, deptManager)).status).toBe(404);
    const owned = await makeAsset(app, hr.header, category.id, { departmentId });
    expect((await assign(owned.id, alice, deptManager)).status).toBe(201);
  });

  it('names the holder when an asset is already out, and lets a second handover through once it is back', async () => {
    const asset = await makeAsset(app, hr.header, category.id);
    await assign(asset.id, alice);
    const clash = await assign(asset.id, bob);
    expect(clash.status).toBe(409);
    expect(clash.body.error).toContain(`${asset.assetTag} is already assigned to`);
    await request(app)
      .post(`/api/assets/${asset.id}/return`)
      .set(hr.header)
      .send({ conditionIn: 'GOOD' });
    expect((await assign(asset.id, bob)).status).toBe(201);
  });

  it('refuses to return what nobody holds, and to hand over a retired or lost asset or to a leaver', async () => {
    const asset = await makeAsset(app, hr.header, category.id);
    expect(
      (
        await request(app)
          .post(`/api/assets/${asset.id}/return`)
          .set(hr.header)
          .send({ conditionIn: 'GOOD' })
      ).status,
    ).toBe(409);
    const retired = await makeAsset(app, hr.header, category.id);
    await request(app)
      .post(`/api/assets/${retired.id}/retire`)
      .set(hr.header)
      .send({ note: 'old' });
    expect((await assign(retired.id, alice)).status).toBe(409);
    const leaver = await hireActor(prefix, departmentId);
    await prisma.employee.update({
      where: { id: leaver.employee.id },
      data: { employmentStatus: 'TERMINATED' },
    });
    expect((await assign(asset.id, leaver)).status).toBe(409);
  });

  it('lets exactly one of two simultaneous handovers win', async () => {
    const asset = await makeAsset(app, hr.header, category.id);
    const results = await Promise.all([assign(asset.id, alice), assign(asset.id, bob)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(
      await prisma.assetAssignment.count({ where: { assetId: asset.id, returnedAt: null } }),
    ).toBe(1);
  });

  it('keeps the previous holder’s record when the asset moves on', async () => {
    const asset = await makeAsset(app, hr.header, category.id);
    await assign(asset.id, alice);
    await request(app)
      .post(`/api/assets/${asset.id}/return`)
      .set(hr.header)
      .send({ conditionIn: 'GOOD' });
    await assign(asset.id, bob);
    const detail = (await request(app).get(`/api/assets/${asset.id}`).set(hr.header)).body;
    expect(detail.assignments.map((a: { employeeId: string }) => a.employeeId)).toEqual([
      bob.employee.id,
      alice.employee.id,
    ]);
  });
});

describe('acknowledging receipt', () => {
  it('is the holder’s alone, repeatable without harm, and visible on the chase list until done', async () => {
    const asset = await makeAsset(app, hr.header, category.id);
    const given = (await assign(asset.id, alice)).body;
    const chase = async () =>
      (await request(app).get('/api/assets/unacknowledged').set(hr.header)).body.map(
        (a: { id: string }) => a.id,
      );
    expect(await chase()).toContain(given.id);
    expect((await request(app).get('/api/assets/unacknowledged').set(alice.header)).status).toBe(
      403,
    );
    expect(
      (await request(app).post(`/api/assets/assignments/${given.id}/acknowledge`).set(bob.header))
        .status,
    ).toBe(404);
    const first = await request(app)
      .post(`/api/assets/assignments/${given.id}/acknowledge`)
      .set(alice.header);
    expect(first.status).toBe(200);
    expect(first.body.acknowledgedAt).not.toBeNull();
    const second = await request(app)
      .post(`/api/assets/assignments/${given.id}/acknowledge`)
      .set(alice.header);
    expect(second.body.acknowledgedAt).toBe(first.body.acknowledgedAt);
    expect(await chase()).not.toContain(given.id);
    expect(
      await prisma.outboxEvent.count({
        where: { type: 'asset.acknowledged', payload: { path: ['assetId'], equals: asset.id } },
      }),
    ).toBe(1);
  });

  it('lists a person’s own holdings at /me, current and past', async () => {
    const asset = await makeAsset(app, hr.header, category.id, { name: 'Mine to list' });
    await assign(asset.id, alice);
    const mine = await request(app).get('/api/assets/me').set(alice.header);
    expect(mine.status).toBe(200);
    expect(mine.body.find((h: { assetId: string }) => h.assetId === asset.id)).toMatchObject({
      returnedAt: null,
      asset: { assetTag: asset.assetTag, name: 'Mine to list' },
    });
    expect(
      (await request(app).get('/api/assets/me').set(bob.header)).body.map(
        (h: { assetId: string }) => h.assetId,
      ),
    ).not.toContain(asset.id);
  });
});
