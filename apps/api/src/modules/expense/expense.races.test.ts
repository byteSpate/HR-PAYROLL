import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { memoryStorage, setStorageForTests, type AttachmentStorage } from '@erp/attachments';
import { prisma, type Prisma } from '@erp/db';
import { createApp } from '../../app.js';
import { makeActor } from '../../test-utils/access.js';
import { cleanExpenseData, daysAgo, hireActor, makeDepartment } from './expense.fixtures.js';

// Each case freezes a claim the way a decision (or an edit) in flight would: a second connection holds the
// row lock, the request under test passes its first look at the claim and queues behind the lock, and only
// then does the held transaction commit its change. What the request does next is the thing being tested.

const prefix = 'zzexprace';
const app = createApp();
let departmentId: string;
let alice: Awaited<ReturnType<typeof hireActor>>;
let approver: Awaited<ReturnType<typeof hireActor>>;
let category: string;
let storage: AttachmentStorage;
let storedIds: string[];

const pdf = { filename: 'taxi.pdf', contentType: 'application/pdf' };

beforeAll(async () => {
  departmentId = (await makeDepartment(prefix)).id;
  alice = await hireActor(prefix, departmentId);
  approver = await hireActor(prefix, departmentId, ['expense.approve:all']);
  const config = await makeActor(prefix, 'STANDARD', ['expense.config']);
  category = (await request(app).post('/api/expenses/categories').set(config.header).send({ code: `${prefix}_FOOD`, name: `${prefix} Food` })).body.id;
});
beforeEach(() => {
  storedIds = [];
  const inner = memoryStorage();
  storage = { ...inner, upload: async (file, folder) => { const stored = await inner.upload(file, folder); storedIds.push(stored.publicId); return stored; } };
  setStorageForTests(storage);
});
afterEach(() => setStorageForTests(undefined));
afterAll(async () => {
  await cleanExpenseData(prefix, [departmentId]);
});

const file = async (amount: string | number = 80) =>
  (await request(app).post('/api/expenses').set(alice.header).send({ name: 'Team lunch', amount, categoryId: category, currency: 'BDT', expenseDate: daysAgo(5) })).body;

/** Holds the claim's row lock, and applies `change` when `commit` is called. */
async function holdClaim(claimId: string, change: Prisma.ExpenseClaimUpdateInput) {
  let release!: () => void;
  let locked!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  const gotLock = new Promise<void>((resolve) => (locked = resolve));
  const done = prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "ExpenseClaim" WHERE id = ${claimId} FOR UPDATE`;
      locked();
      await held;
      await tx.expenseClaim.update({ where: { id: claimId }, data: change });
    },
    { timeout: 30_000 },
  );
  await gotLock;
  return {
    async commit() {
      release();
      await done;
    },
  };
}

/** Resolves once some other connection is queued behind a row lock, so the request under test has reached it. */
async function untilQueued() {
  for (let i = 0; i < 100; i++) {
    const [{ waiting }] = await prisma.$queryRaw<{ waiting: bigint }[]>`SELECT count(*) AS waiting FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND datname = current_database()`;
    if (waiting > 0n) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('the request never queued behind the lock');
}

/** Sends `send()` while the claim is locked, then lets `change` commit and returns the response. */
async function racing(claimId: string, change: Prisma.ExpenseClaimUpdateInput, send: () => PromiseLike<request.Response>) {
  const hold = await holdClaim(claimId, change);
  const pending = Promise.resolve(send());
  await untilQueued();
  await hold.commit();
  return pending;
}

const approved = { status: 'APPROVED' as const, decidedBy: 'someone', decidedAt: new Date() };

describe('a claim edited or deleted as it is approved', () => {
  it('refuses the edit that loses the race, and leaves the approved figures alone', async () => {
    const made = await file(80);
    const res = await racing(made.id, approved, () => request(app).patch(`/api/expenses/${made.id}`).set(alice.header).send({ amount: '9999' }));
    expect(res.status).toBe(409);
    const row = await prisma.expenseClaim.findUniqueOrThrow({ where: { id: made.id } });
    expect(row.status).toBe('APPROVED');
    expect(row.amount.toFixed(2)).toBe('80.00');
  });

  it('refuses the delete that loses the race, so an approved claim is never removed', async () => {
    const made = await file(80);
    const res = await racing(made.id, approved, () => request(app).delete(`/api/expenses/${made.id}`).set(alice.header));
    expect(res.status).toBe(409);
    expect(await prisma.expenseClaim.count({ where: { id: made.id } })).toBe(1);
  });

  it('keeps the receipts of a claim whose delete lost the race', async () => {
    const made = await file(80);
    const up = await request(app).post(`/api/expenses/${made.id}/receipts`).set(alice.header).attach('file', Buffer.from('%PDF-1.7'), pdf);
    expect(up.status).toBe(201);
    const res = await racing(made.id, approved, () => request(app).delete(`/api/expenses/${made.id}`).set(alice.header));
    expect(res.status).toBe(409);
    expect(await prisma.expenseAttachment.count({ where: { claimId: made.id } })).toBe(1);
    expect(() => storage.signedUrl(storedIds[0]!, { format: 'pdf', expiresInSeconds: 60 })).not.toThrow();
  });
});

describe('receipts changed as a claim is approved', () => {
  it('refuses the upload that loses the race, and does not leave its file behind', async () => {
    const made = await file(80);
    const res = await racing(made.id, approved, () => request(app).post(`/api/expenses/${made.id}/receipts`).set(alice.header).attach('file', Buffer.from('%PDF-1.7'), pdf));
    expect(res.status).toBe(409);
    expect(await prisma.expenseAttachment.count({ where: { claimId: made.id } })).toBe(0);
    expect(storedIds).toHaveLength(1);
    expect(() => storage.signedUrl(storedIds[0]!, { format: 'pdf', expiresInSeconds: 60 })).toThrow();
  });

  it('refuses the receipt removal that loses the race, and keeps both the row and the file', async () => {
    const made = await file(80);
    const up = await request(app).post(`/api/expenses/${made.id}/receipts`).set(alice.header).attach('file', Buffer.from('%PDF-1.7'), pdf);
    const res = await racing(made.id, approved, () => request(app).delete(`/api/expenses/receipts/${up.body.id}`).set(alice.header));
    expect(res.status).toBe(409);
    expect(await prisma.expenseAttachment.count({ where: { id: up.body.id } })).toBe(1);
    expect(() => storage.signedUrl(storedIds[0]!, { format: 'pdf', expiresInSeconds: 60 })).not.toThrow();
  });
});

describe('a claim approved or rejected as it is edited', () => {
  it('decides on the figures as they stand once the edit lands, not the ones read before it', async () => {
    const made = await file(80);
    const res = await racing(made.id, { amount: '99.00' }, () => request(app).post(`/api/expenses/${made.id}/approve`).set(approver.header).send({}));
    expect(res.status).toBe(200);
    expect(res.body.amount).toBe('99.00');
    const event = await prisma.outboxEvent.findFirst({ where: { type: 'expense.claim.approved', payload: { path: ['claimId'], equals: made.id } } });
    expect(event?.payload).toMatchObject({ amount: '99.00', amountBdt: '99.00' });
  });

  it('puts the edited amount on a rejection too', async () => {
    const made = await file(80);
    const res = await racing(made.id, { amount: '99.00' }, () => request(app).post(`/api/expenses/${made.id}/reject`).set(approver.header).send({ note: 'No receipt' }));
    expect(res.status).toBe(200);
    const event = await prisma.outboxEvent.findFirst({ where: { type: 'expense.claim.rejected', payload: { path: ['claimId'], equals: made.id } } });
    expect(event?.payload).toMatchObject({ amount: '99.00' });
  });
});
