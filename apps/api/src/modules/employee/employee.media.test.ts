import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { memoryStorage, setStorageForTests } from '@erp/attachments';
import { prisma } from '@erp/db';
import { createApp } from '../../app.js';
import { cleanActors, makeActor } from '../../test-utils/access.js';
import { hire, removeEmployees } from './employee.fixtures.js';

const app = createApp();
const P = 'zztest11m';
let dep: string;
let hr: { Authorization: string };

const pdf = { filename: 'contract.pdf', contentType: 'application/pdf' };
const png = { filename: 'me.png', contentType: 'image/png' };

beforeAll(async () => {
  await removeEmployees(P);
  await prisma.department.deleteMany({ where: { name: { startsWith: P } } });
  dep = (await prisma.department.create({ data: { name: `${P} Dept` } })).id;
  hr = (
    await makeActor(P, 'STANDARD', ['employee.create', 'employee.read:all', 'employee.update:all', 'employee.documents.manage:all'])
  ).header;
});
beforeEach(() => setStorageForTests(memoryStorage()));
afterEach(async () => {
  setStorageForTests(undefined);
  await removeEmployees(P);
});
afterAll(async () => {
  await cleanActors(P);
  await prisma.department.deleteMany({ where: { name: { startsWith: P } } });
});

const upload = (id: string, as: { Authorization: string }, type = 'CONTRACT', file = Buffer.from('%PDF-1.7'), meta = pdf) =>
  request(app).post(`/api/employees/${id}/documents`).set(as).field('type', type).attach('file', file, meta);

describe('employee documents', () => {
  it('uploads, lists, signs a download url and deletes', async () => {
    const e = await hire(app, P, hr, dep);
    const up = await upload(e.id, hr);
    expect(up.status).toBe(201);
    expect(up.body).toMatchObject({ type: 'CONTRACT', fileName: 'contract.pdf', format: 'pdf' });

    const list = await request(app).get(`/api/employees/${e.id}/documents`).set(e.as);
    expect(list.body.map((d: { id: string }) => d.id)).toEqual([up.body.id]);

    const url = await request(app).get(`/api/employees/${e.id}/documents/${up.body.id}/url`).set(e.as);
    expect(url.body.url).toContain('memory://');

    expect((await request(app).delete(`/api/employees/${e.id}/documents/${up.body.id}`).set(hr)).status).toBe(204);
    expect(await prisma.document.count({ where: { employeeId: e.id } })).toBe(0);
  });

  it('keeps documents from colleagues and stops employees uploading to their own file', async () => {
    const a = await hire(app, P, hr, dep);
    const b = await hire(app, P, hr, dep);
    expect((await request(app).get(`/api/employees/${b.id}/documents`).set(a.as)).status).toBe(403);
    expect((await upload(a.id, a.as)).status).toBe(403);
  });

  it('rejects a file type that is not a pdf or image with 415, and an unknown document type with 400', async () => {
    const e = await hire(app, P, hr, dep);
    const exe = await upload(e.id, hr, 'CONTRACT', Buffer.from('MZ'), { filename: 'x.exe', contentType: 'application/x-msdownload' });
    expect(exe.status).toBe(415);
    expect((await upload(e.id, hr, 'PAYSLIP')).status).toBe(400);
  });

  it('answers 503 for uploads when storage is not configured, while listing still works', async () => {
    const e = await hire(app, P, hr, dep);
    setStorageForTests(null);
    expect((await upload(e.id, hr)).status).toBe(503);
    expect((await request(app).get(`/api/employees/${e.id}/documents`).set(hr)).status).toBe(200);
  });
});

describe('avatar', () => {
  it('lets an employee set their own avatar and shows it in their view', async () => {
    const e = await hire(app, P, hr, dep);
    const res = await request(app).patch(`/api/employees/${e.id}/avatar`).set(e.as).attach('file', Buffer.from('png'), png);
    expect(res.status).toBe(200);
    expect(res.body.work.avatarUrl).toContain('memory://');

    const cleared = await request(app).delete(`/api/employees/${e.id}/avatar`).set(e.as);
    expect(cleared.body.work.avatarUrl).toBeNull();
  });

  it('refuses a colleague changing someone else avatar', async () => {
    const a = await hire(app, P, hr, dep);
    const b = await hire(app, P, hr, dep);
    const res = await request(app).patch(`/api/employees/${b.id}/avatar`).set(a.as).attach('file', Buffer.from('png'), png);
    expect(res.status).toBe(403);
  });

  it('shows no avatar url when storage is not configured', async () => {
    const e = await hire(app, P, hr, dep);
    await request(app).patch(`/api/employees/${e.id}/avatar`).set(e.as).attach('file', Buffer.from('png'), png);
    setStorageForTests(null);
    expect((await request(app).get('/api/employees/me').set(e.as)).body.work.avatarUrl).toBeNull();
  });
});
