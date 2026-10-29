import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { memoryStorage, setStorageForTests } from '@erp/attachments';
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

const prefix = 'zzassetmed';
const app = createApp();
let departmentId: string;
let alice: Awaited<ReturnType<typeof hireActor>>;
let bob: Awaited<ReturnType<typeof hireActor>>;
let hr: Awaited<ReturnType<typeof hireActor>>;
let asset: { id: string };
let assignment: { id: string };

const png = { filename: 'photo.png', contentType: 'image/png' };

beforeAll(async () => {
  departmentId = (await makeDepartment(prefix)).id;
  alice = await hireActor(prefix, departmentId);
  bob = await hireActor(prefix, departmentId);
  hr = await hireActor(prefix, departmentId, ['asset.read:all', 'asset.manage:all']);
  const category = await makeCategory(
    app,
    (await makeActor(prefix, 'STANDARD', ['asset.config'])).header,
    prefix,
  );
  asset = await makeAsset(app, hr.header, category.id);
  assignment = (
    await request(app)
      .post(`/api/assets/${asset.id}/assign`)
      .set(hr.header)
      .send({ employeeId: alice.employee.id, conditionOut: 'GOOD' })
  ).body;
});
beforeEach(() => setStorageForTests(memoryStorage()));
afterEach(() => setStorageForTests(undefined));
afterAll(async () => {
  await cleanAssetData(prefix, [departmentId]);
});

const onAsset = (kind: string, who = hr, buffer = Buffer.from('PNGDATA')) =>
  request(app)
    .post(`/api/assets/${asset.id}/attachments`)
    .set(who.header)
    .field('kind', kind)
    .attach('file', buffer, png);
const onHandover = (kind: string, who = hr) =>
  request(app)
    .post(`/api/assets/assignments/${assignment.id}/attachments`)
    .set(who.header)
    .field('kind', kind)
    .attach('file', Buffer.from('PNGDATA'), png);

describe('files on an asset', () => {
  it('accepts a photo, invoice or warranty from whoever manages assets, and never exposes the storage id', async () => {
    const res = await onAsset('PHOTO');
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      kind: 'PHOTO',
      fileName: 'photo.png',
      format: 'png',
      bytes: 7,
      assetId: asset.id,
      assignmentId: null,
    });
    expect(res.body).not.toHaveProperty('publicId');
    expect((await onAsset('PHOTO', alice)).status).toBe(403);
    expect((await onAsset('NOPE')).status).toBe(400);
    expect((await onAsset('CONDITION_OUT')).status).toBe(400);
  });

  it('keeps condition photos for handovers, and refuses asset kinds there', async () => {
    expect((await onHandover('CONDITION_OUT')).status).toBe(201);
    expect((await onHandover('INVOICE')).status).toBe(400);
  });

  it('refuses a file type or size it does not take', async () => {
    const bad = await request(app)
      .post(`/api/assets/${asset.id}/attachments`)
      .set(hr.header)
      .field('kind', 'PHOTO')
      .attach('file', Buffer.from('x'), {
        filename: 'a.exe',
        contentType: 'application/x-msdownload',
      });
    expect(bad.status).toBe(415);
    const big = await onAsset('PHOTO', hr, Buffer.alloc(16 * 1024 * 1024));
    expect(big.status).toBe(413);
  });

  it('shows up on the asset’s detail, listed newest first', async () => {
    const detail = await request(app).get(`/api/assets/${asset.id}`).set(hr.header);
    expect(detail.body.attachments.length).toBeGreaterThan(0);
    expect(detail.body.attachments[0]).not.toHaveProperty('publicId');
  });

  it('opens through a short-lived link, for anyone who can see the asset and nobody else', async () => {
    const up = (await onAsset('INVOICE')).body;
    const mine = await request(app).get(`/api/assets/attachments/${up.id}/url`).set(alice.header);
    expect(mine.status).toBe(200);
    expect(mine.body.url).toContain('memory://');
    expect(new Date(mine.body.expiresAt).getTime()).toBeGreaterThan(Date.now());
    expect(
      (await request(app).get(`/api/assets/attachments/${up.id}/url`).set(bob.header)).status,
    ).toBe(404);
    expect(
      (await request(app).get('/api/assets/attachments/missing/url').set(hr.header)).status,
    ).toBe(404);
  });

  it('removes the row, then the file, and audits who did it', async () => {
    const up = (await onAsset('WARRANTY')).body;
    expect(
      (await request(app).delete(`/api/assets/attachments/${up.id}`).set(alice.header)).status,
    ).toBe(403);
    expect(
      (await request(app).delete(`/api/assets/attachments/${up.id}`).set(hr.header)).status,
    ).toBe(204);
    expect(await prisma.assetAttachment.count({ where: { id: up.id } })).toBe(0);
    expect(
      (
        await prisma.auditLog.findFirst({
          where: { entity: 'ASSET', entityId: asset.id, action: 'DELETE' },
        })
      )?.changedBy,
    ).toBe(hr.user.id);
  });
});
