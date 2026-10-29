import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '@erp/db';
import { createApp } from '../../app.js';
import { cleanActors, makeActor } from '../../test-utils/access.js';

// The account endpoints behind the account-only profile: someone with no employee record keeps their
// name, photo and sign-ins here instead of on the employee.
const prefix = 'zzaccount';
const app = createApp();
let plain: Awaited<ReturnType<typeof makeActor>>;
let staff: Awaited<ReturnType<typeof makeActor>>;
let departmentId: string;
let employeeId: string;

beforeAll(async () => {
  plain = await makeActor(prefix, 'STANDARD');
  staff = await makeActor(prefix, 'STANDARD');
  departmentId = (await prisma.department.create({ data: { name: `${prefix}-${Date.now()}` } })).id;
  employeeId = (await prisma.employee.create({ data: { userId: staff.user.id, employeeCode: `${prefix}-${Date.now()}`, fullName: 'Staff Member', designation: 'Engineer', departmentId, employmentType: 'FULL_TIME', joiningDate: new Date('2026-01-01T00:00:00Z') } })).id;
});
afterAll(async () => {
  await prisma.refreshToken.deleteMany({ where: { userId: { in: [plain.user.id, staff.user.id] } } });
  await prisma.employee.delete({ where: { id: employeeId } });
  await prisma.department.delete({ where: { id: departmentId } });
  await cleanActors(prefix);
});

const session = (userId: string, lastUsedAt: Date) =>
  prisma.refreshToken.create({ data: { userId, tokenHash: `${prefix}-${Math.random()}`, expiresAt: new Date(Date.now() + 86_400_000), lastUsedAt } });

describe('GET /api/auth/account', () => {
  it('summarises the account and its live sign-ins', async () => {
    const quiet = (await request(app).get('/api/auth/account').set(plain.header)).body;
    expect(quiet).toMatchObject({ email: plain.user.email, accessLevel: 'STANDARD', role: null, mustChangePassword: false, displayName: null, avatarUrl: null, sessions: { count: 0, lastActiveAt: null } });
    expect(typeof quiet.createdAt).toBe('string');
    const recent = new Date('2026-10-01T10:00:00Z');
    await session(plain.user.id, new Date('2026-09-01T10:00:00Z'));
    await session(plain.user.id, recent);
    const busy = (await request(app).get('/api/auth/account').set(plain.header)).body;
    expect(busy.sessions).toEqual({ count: 2, lastActiveAt: recent.toISOString() });
  });

  it('needs a sign-in', async () => {
    expect((await request(app).get('/api/auth/account')).status).toBe(401);
  });
});

describe('PATCH /api/auth/display-name', () => {
  it('sets a trimmed name for an account with no employee record', async () => {
    const res = await request(app).patch('/api/auth/display-name').set(plain.header).send({ displayName: '  Pat Admin  ' });
    expect(res.status).toBe(200);
    expect(res.body.displayName).toBe('Pat Admin');
    expect((await request(app).patch('/api/auth/display-name').set(plain.header).send({ displayName: '   ' })).status).toBe(400);
  });

  it('leaves staff to edit their name on their employee profile', async () => {
    expect((await request(app).patch('/api/auth/display-name').set(staff.header).send({ displayName: 'Someone Else' })).status).toBe(409);
  });
});

describe('POST /api/auth/logout-everywhere', () => {
  it('revokes every live sign-in of the caller and nobody else’s', async () => {
    await session(plain.user.id, new Date());
    await session(staff.user.id, new Date());
    expect((await request(app).post('/api/auth/logout-everywhere').set(plain.header)).status).toBe(204);
    expect(await prisma.refreshToken.count({ where: { userId: plain.user.id, revokedAt: null } })).toBe(0);
    expect(await prisma.refreshToken.count({ where: { userId: staff.user.id, revokedAt: null } })).toBeGreaterThan(0);
  });
});

describe('own avatar', () => {
  it('answers 503 while file storage is not configured, and clearing is always allowed', async () => {
    const res = await request(app).patch('/api/auth/avatar').set(plain.header).attach('file', Buffer.from('x'), { filename: 'a.png', contentType: 'image/png' });
    expect(res.status).toBe(503);
    const cleared = await request(app).delete('/api/auth/avatar').set(plain.header);
    expect(cleared.status).toBe(200);
    expect(cleared.body.avatarUrl).toBeNull();
  });
});
