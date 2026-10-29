import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { memoryStorage, setStorageForTests } from '@erp/attachments';
import { prisma } from '@erp/db';
import { createApp } from '../../app.js';
import { makeActor } from '../../test-utils/access.js';
import { cleanExpenseData, daysAgo, hireActor, makeDepartment } from './expense.fixtures.js';

const prefix = 'zzexpreceipt';
const app = createApp();
let departmentId: string;
let otherDepartmentId: string;
let manager: Awaited<ReturnType<typeof hireActor>>;
let alice: Awaited<ReturnType<typeof hireActor>>;
let bob: Awaited<ReturnType<typeof hireActor>>;
let outsider: Awaited<ReturnType<typeof hireActor>>;
let approver: Awaited<ReturnType<typeof hireActor>>;
let category: string;

const pdf = { filename: 'taxi.pdf', contentType: 'application/pdf' };

beforeAll(async () => {
  departmentId = (await makeDepartment(prefix)).id;
  otherDepartmentId = (await makeDepartment(prefix)).id;
  manager = await hireActor(prefix, departmentId, ['expense.read:team']);
  alice = await hireActor(prefix, departmentId, [], { managerEmployeeId: manager.employee.id });
  bob = await hireActor(prefix, departmentId);
  outsider = await hireActor(prefix, otherDepartmentId);
  approver = await hireActor(prefix, otherDepartmentId, ['expense.approve:all']);
  const config = await makeActor(prefix, 'STANDARD', ['expense.config']);
  category = (await request(app).post('/api/expenses/categories').set(config.header).send({ code: `${prefix}_FOOD`, name: `${prefix} Food` })).body.id;
});
beforeEach(() => setStorageForTests(memoryStorage()));
afterEach(() => setStorageForTests(undefined));
afterAll(async () => {
  await cleanExpenseData(prefix, [departmentId, otherDepartmentId]);
});

const file = async (who: { header: object }) =>
  (await request(app).post('/api/expenses').set(who.header).send({ name: 'Taxi', amount: 450, categoryId: category, currency: 'BDT', expenseDate: daysAgo(2) })).body;
const upload = (id: string, who: { header: object }, buffer = Buffer.from('%PDF-1.7'), meta: object = pdf) =>
  request(app).post(`/api/expenses/${id}/receipts`).set(who.header).attach('file', buffer, meta);

describe('receipts on a claim', () => {
  it('lets the owner attach, list, open and remove a receipt on a pending claim', async () => {
    const made = await file(alice);
    const up = await upload(made.id, alice);
    expect(up.status).toBe(201);
    expect(up.body).toMatchObject({ fileName: 'taxi.pdf', format: 'pdf', bytes: 8 });
    expect(up.body).not.toHaveProperty('publicId');
    const list = await request(app).get(`/api/expenses/${made.id}/receipts`).set(alice.header);
    expect(list.body.map((r: { id: string }) => r.id)).toEqual([up.body.id]);
    const url = await request(app).get(`/api/expenses/receipts/${up.body.id}/url`).set(alice.header);
    expect(url.body.url).toContain('memory://');
    expect(new Date(url.body.expiresAt).getTime()).toBeGreaterThan(Date.now());
    expect((await request(app).delete(`/api/expenses/receipts/${up.body.id}`).set(alice.header)).status).toBe(204);
    expect(await prisma.expenseAttachment.count({ where: { claimId: made.id } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { entity: 'EXPENSE_CLAIM', entityId: made.id, action: 'DELETE' } })).toBe(1);
  });

  it('lets whoever may read the claim read its receipts, and hides them from everyone else with 404', async () => {
    const made = await file(alice);
    const up = await upload(made.id, alice);
    expect((await request(app).get(`/api/expenses/${made.id}/receipts`).set(manager.header)).status).toBe(200);
    expect((await request(app).get(`/api/expenses/receipts/${up.body.id}/url`).set(manager.header)).status).toBe(200);
    expect((await request(app).get(`/api/expenses/${made.id}/receipts`).set(bob.header)).status).toBe(404);
    expect((await request(app).get(`/api/expenses/receipts/${up.body.id}/url`).set(outsider.header)).status).toBe(404);
    expect((await request(app).get('/api/expenses/receipts/00000000-0000-0000-0000-000000000000/url').set(alice.header)).status).toBe(404);
  });

  it('is the owner’s to change: nobody else attaches or removes, an approver included', async () => {
    const made = await file(alice);
    const up = await upload(made.id, alice);
    expect((await upload(made.id, bob)).status).toBe(404);
    expect((await upload(made.id, approver)).status).toBe(404);
    expect((await request(app).delete(`/api/expenses/receipts/${up.body.id}`).set(manager.header)).status).toBe(404);
  });

  it('freezes the evidence once the claim is decided', async () => {
    const made = await file(alice);
    const up = await upload(made.id, alice);
    await request(app).post(`/api/expenses/${made.id}/reject`).set(approver.header).send({ note: 'No' });
    expect((await upload(made.id, alice)).status).toBe(409);
    expect((await request(app).delete(`/api/expenses/receipts/${up.body.id}`).set(alice.header)).status).toBe(409);
    expect((await request(app).get(`/api/expenses/${made.id}/receipts`).set(alice.header)).status).toBe(200);
  });

  it('answers 503 at once when file storage is not configured, 400 for a missing file and 415 for the wrong type', async () => {
    const made = await file(alice);
    expect((await request(app).post(`/api/expenses/${made.id}/receipts`).set(alice.header)).status).toBe(400);
    expect((await upload(made.id, alice, Buffer.from('hi'), { filename: 'x.exe', contentType: 'application/x-msdownload' })).status).toBe(415);
    setStorageForTests(null);
    expect((await upload(made.id, alice)).status).toBe(503);
  });

  it('removes the stored files when the claim is withdrawn', async () => {
    const storage = memoryStorage();
    setStorageForTests(storage);
    const made = await file(alice);
    const up = await upload(made.id, alice);
    const row = await prisma.expenseAttachment.findUniqueOrThrow({ where: { id: up.body.id } });
    expect(() => storage.signedUrl(row.publicId)).not.toThrow();
    expect((await request(app).delete(`/api/expenses/${made.id}`).set(alice.header)).status).toBe(204);
    expect(() => storage.signedUrl(row.publicId)).toThrow();
  });
});
