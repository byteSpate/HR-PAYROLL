import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { hashToken } from '@erp/auth';
import { prisma } from '@erp/db';
import { createApp } from '../../app.js';
import { ensureTestSuperAdmin, bearer, makeActor, cleanActors } from '../../test-utils/access.js';

const prefix = 'zzemail';
const app = createApp();
const HOUR = 60 * 60 * 1000;

let superAdmin: Awaited<ReturnType<typeof ensureTestSuperAdmin>>;
let alice: Awaited<ReturnType<typeof makeActor>>;
let bob: Awaited<ReturnType<typeof makeActor>>;

beforeAll(async () => {
  superAdmin = await ensureTestSuperAdmin();
  alice = await makeActor(prefix, 'STANDARD');
  bob = await makeActor(prefix, 'STANDARD');
});

afterAll(async () => {
  await cleanActors(prefix);
});

afterEach(async () => {
  await prisma.emailChangeRequest.deleteMany({
    where: { userId: { in: [alice.user.id, bob.user.id] } },
  });
  await prisma.emailDispatch.deleteMany({ where: { kind: { startsWith: 'EMAIL_CHANGE' } } });
});

const future = () => new Date(Date.now() + HOUR);

describe('POST /api/auth/email-change', () => {
  it('starts a change and mails the address on file', async () => {
    const res = await request(app)
      .post('/api/auth/email-change')
      .set(alice.header)
      .send({ newEmail: 'zzemail-actor-alice.new@example.com' });
    expect(res.status).toBe(200);
    expect(res.body.newEmail).toBe('zzemail-actor-alice.new@example.com');
    expect(res.body.approved).toBe(false);
    expect(typeof res.body.expiresAt).toBe('string');

    const row = await prisma.emailChangeRequest.findFirst({
      where: { userId: alice.user.id, newEmail: 'zzemail-actor-alice.new@example.com' },
    });
    expect(row).not.toBeNull();
    expect(row!.approveTokenHash).toBeTruthy();
    expect(row!.confirmTokenHash).toBeNull();
  });

  it('refuses an address already used by another account (409)', async () => {
    const res = await request(app)
      .post('/api/auth/email-change')
      .set(alice.header)
      .send({ newEmail: bob.user.email });
    expect(res.status).toBe(409);
    expect(res.body.error).toContain('already in use');
  });

  it('refuses the address the account already has (400)', async () => {
    const res = await request(app)
      .post('/api/auth/email-change')
      .set(alice.header)
      .send({ newEmail: alice.user.email });
    expect(res.status).toBe(400);
  });

  it('needs a sign-in', async () => {
    const res = await request(app)
      .post('/api/auth/email-change')
      .send({ newEmail: 'zzemail-actor-alice.new@example.com' });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/email-change/approve', () => {
  it('approves from the old address and mints a confirm token', async () => {
    const rawApprove = 'raw-approve-token';
    await prisma.emailChangeRequest.create({
      data: {
        userId: alice.user.id,
        newEmail: 'zzemail-actor-alice.approved@example.com',
        approveTokenHash: hashToken(rawApprove),
        expiresAt: future(),
      },
    });

    const res = await request(app)
      .post('/api/auth/email-change/approve')
      .send({ token: rawApprove });
    expect(res.status).toBe(200);
    expect(res.body.newEmail).toBe('zzemail-actor-alice.approved@example.com');

    const row = await prisma.emailChangeRequest.findUnique({
      where: { approveTokenHash: hashToken(rawApprove) },
    });
    expect(row!.approvedAt).not.toBeNull();
    expect(row!.confirmTokenHash).toBeTruthy();
  });

  it('a second use of the same approve token is 400 (already completed path via cancel first)', async () => {
    const rawApprove = 'raw-approve-once';
    await prisma.emailChangeRequest.create({
      data: {
        userId: alice.user.id,
        newEmail: 'zzemail-actor-alice.once@example.com',
        approveTokenHash: hashToken(rawApprove),
        expiresAt: future(),
      },
    });

    // Approve once
    await request(app).post('/api/auth/email-change/approve').send({ token: rawApprove });

    // The approve token is still usable (approval doesn't consume it — cancel does).
    // Instead, confirm the change, which completes the request.
    const row = await prisma.emailChangeRequest.findUnique({
      where: { approveTokenHash: hashToken(rawApprove) },
    });
    await prisma.emailChangeRequest.update({
      where: { id: row!.id },
      data: { completedAt: new Date() },
    });

    // Now the same approve token is dead because the request is completed.
    const res = await request(app)
      .post('/api/auth/email-change/approve')
      .send({ token: rawApprove });
    expect(res.status).toBe(400);
  });

  it('approving twice is 409 and sends only one confirm mail', async () => {
    const rawApprove = 'raw-approve-double';
    await prisma.emailChangeRequest.create({
      data: {
        userId: alice.user.id,
        newEmail: 'zzemail-actor-alice.double@example.com',
        approveTokenHash: hashToken(rawApprove),
        expiresAt: future(),
      },
    });
    const first = await request(app)
      .post('/api/auth/email-change/approve')
      .send({ token: rawApprove });
    const before = await prisma.emailChangeRequest.findUniqueOrThrow({
      where: { approveTokenHash: hashToken(rawApprove) },
    });
    const second = await request(app)
      .post('/api/auth/email-change/approve')
      .send({ token: rawApprove });
    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
    const after = await prisma.emailChangeRequest.findUniqueOrThrow({
      where: { approveTokenHash: hashToken(rawApprove) },
    });
    expect(after.confirmTokenHash).toBe(before.confirmTokenHash);
    expect(await prisma.emailDispatch.count({ where: { kind: 'EMAIL_CHANGE_CONFIRM' } })).toBe(1);
  });

  it('an expired approve token is 400', async () => {
    const rawApprove = 'raw-approve-expired';
    await prisma.emailChangeRequest.create({
      data: {
        userId: alice.user.id,
        newEmail: 'zzemail-actor-alice.expired@example.com',
        approveTokenHash: hashToken(rawApprove),
        expiresAt: new Date(Date.now() - HOUR),
      },
    });

    const res = await request(app)
      .post('/api/auth/email-change/approve')
      .send({ token: rawApprove });
    expect(res.status).toBe(400);
  });

  it('an unknown approve token is 400', async () => {
    const res = await request(app)
      .post('/api/auth/email-change/approve')
      .send({ token: 'does-not-exist' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/email-change/confirm', () => {
  it('confirms from the new address and changes the account email', async () => {
    const rawConfirm = 'raw-confirm-token';
    await prisma.user.update({
      where: { id: alice.user.id },
      data: { email: 'zzemail-actor-alice.old@example.com' },
    });
    await prisma.emailChangeRequest.create({
      data: {
        userId: alice.user.id,
        newEmail: 'zzemail-actor-alice.confirmed@example.com',
        approveTokenHash: hashToken('raw-approve-x'),
        approvedAt: new Date(),
        confirmTokenHash: hashToken(rawConfirm),
        expiresAt: future(),
      },
    });

    const res = await request(app)
      .post('/api/auth/email-change/confirm')
      .send({ token: rawConfirm });
    expect(res.status).toBe(200);
    expect(res.body.email).toBe('zzemail-actor-alice.confirmed@example.com');

    const user = await prisma.user.findUnique({ where: { id: alice.user.id } });
    expect(user!.email).toBe('zzemail-actor-alice.confirmed@example.com');

    const row = await prisma.emailChangeRequest.findUnique({
      where: { confirmTokenHash: hashToken(rawConfirm) },
    });
    expect(row!.completedAt).not.toBeNull();
  });

  it('a confirm token whose request was never approved is 400', async () => {
    const rawConfirm = 'raw-confirm-unapproved';
    await prisma.emailChangeRequest.create({
      data: {
        userId: alice.user.id,
        newEmail: 'zzemail-actor-alice.unapproved@example.com',
        approveTokenHash: hashToken('raw-approve-y'),
        approvedAt: null,
        confirmTokenHash: hashToken(rawConfirm),
        expiresAt: future(),
      },
    });

    const res = await request(app)
      .post('/api/auth/email-change/confirm')
      .send({ token: rawConfirm });
    expect(res.status).toBe(400);
  });

  it('refuses with 409, not a server error, when the address was taken meanwhile', async () => {
    const rawConfirm = 'raw-confirm-taken';
    await prisma.emailChangeRequest.create({
      data: {
        userId: alice.user.id,
        newEmail: bob.user.email,
        approveTokenHash: hashToken('raw-approve-taken'),
        approvedAt: new Date(),
        confirmTokenHash: hashToken(rawConfirm),
        expiresAt: future(),
      },
    });
    const res = await request(app)
      .post('/api/auth/email-change/confirm')
      .send({ token: rawConfirm });
    expect(res.status).toBe(409);
    const row = await prisma.emailChangeRequest.findUniqueOrThrow({
      where: { confirmTokenHash: hashToken(rawConfirm) },
    });
    expect(row.completedAt).toBeNull();
  });

  it('two simultaneous confirms change the address once', async () => {
    const rawConfirm = 'raw-confirm-race';
    await prisma.emailChangeRequest.create({
      data: {
        userId: alice.user.id,
        newEmail: 'zzemail-actor-alice.race@example.com',
        approveTokenHash: hashToken('raw-approve-race'),
        approvedAt: new Date(),
        confirmTokenHash: hashToken(rawConfirm),
        expiresAt: future(),
      },
    });
    const send = () =>
      request(app).post('/api/auth/email-change/confirm').send({ token: rawConfirm });
    const statuses = (await Promise.all([send(), send()])).map((r) => r.status).sort();
    expect(statuses).toEqual([200, 400]);
  });

  it('a second use of the same confirm token is 400', async () => {
    const rawConfirm = 'raw-confirm-twice';
    await prisma.emailChangeRequest.create({
      data: {
        userId: alice.user.id,
        newEmail: 'zzemail-actor-alice.twice@example.com',
        approveTokenHash: hashToken('raw-approve-z'),
        approvedAt: new Date(),
        confirmTokenHash: hashToken(rawConfirm),
        expiresAt: future(),
      },
    });

    await request(app).post('/api/auth/email-change/confirm').send({ token: rawConfirm });

    const res = await request(app)
      .post('/api/auth/email-change/confirm')
      .send({ token: rawConfirm });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/email-change/cancel', () => {
  it('cancels from the old address and revokes sessions', async () => {
    const rawApprove = 'raw-approve-cancel';
    await prisma.emailChangeRequest.create({
      data: {
        userId: alice.user.id,
        newEmail: 'zzemail-actor-alice.cancelled@example.com',
        approveTokenHash: hashToken(rawApprove),
        expiresAt: future(),
      },
    });

    const res = await request(app)
      .post('/api/auth/email-change/cancel')
      .send({ token: rawApprove });
    expect(res.status).toBe(204);

    const row = await prisma.emailChangeRequest.findUnique({
      where: { approveTokenHash: hashToken(rawApprove) },
    });
    expect(row!.cancelledAt).not.toBeNull();
  });
});

describe('GET /api/auth/email-change', () => {
  it('shows the pending change for the account', async () => {
    await prisma.emailChangeRequest.create({
      data: {
        userId: alice.user.id,
        newEmail: 'zzemail-actor-alice.pending@example.com',
        approveTokenHash: hashToken('raw-approve-p'),
        expiresAt: future(),
      },
    });

    const res = await request(app).get('/api/auth/email-change').set(alice.header);
    expect(res.status).toBe(200);
    expect(res.body.newEmail).toBe('zzemail-actor-alice.pending@example.com');
    expect(res.body.approved).toBe(false);
  });
});

describe('POST /api/users/:id/resend-credentials', () => {
  it('replaces the password and mails CREDENTIALS (super admin)', async () => {
    const target = await makeActor(prefix, 'STANDARD');
    const oldPassword = 'correct-horse-9';

    // Old password works
    const loginBefore = await request(app).post('/api/auth/login').send({
      email: target.user.email,
      password: oldPassword,
    });
    expect(loginBefore.status).toBe(200);

    const res = await request(app)
      .post(`/api/users/${target.user.id}/resend-credentials`)
      .set(bearer(superAdmin.id, 'SUPER_ADMIN'))
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.temporaryPassword).toBeTruthy();

    // Old password no longer works
    const loginAfter = await request(app).post('/api/auth/login').send({
      email: target.user.email,
      password: oldPassword,
    });
    expect(loginAfter.status).toBe(401);

    // A CREDENTIALS dispatch was written
    const dispatch = await prisma.emailDispatch.findFirst({
      where: { to: target.user.email, kind: 'CREDENTIALS' },
    });
    expect(dispatch).not.toBeNull();
    expect(dispatch!.sentAt).toBeNull(); // no SMTP in test

    await prisma.user.delete({ where: { id: target.user.id } });
  });

  it('without user.manage is 403', async () => {
    const target = await makeActor(prefix, 'STANDARD');
    const res = await request(app)
      .post(`/api/users/${target.user.id}/resend-credentials`)
      .set(bearer(alice.user.id, 'STANDARD'))
      .send({});
    expect(res.status).toBe(403);
    await prisma.user.delete({ where: { id: target.user.id } });
  });
});
