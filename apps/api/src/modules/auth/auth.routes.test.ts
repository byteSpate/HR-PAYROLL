import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hashPassword } from '@erp/auth';
import { prisma } from '@erp/db';
import { createApp } from '../../app.js';

const app = createApp();
const PASSWORD = 'correct-horse-9';
const PERMS = ['zztest8.read', 'zztest8.write'];
const ROLE_NAMES = ['ZZTEST8_A', 'ZZTEST8_B'];

let seq = 0;
const emails: string[] = [];

async function makeUser(opts: { roles?: string[]; isActive?: boolean; mustChangePassword?: boolean } = {}) {
  const email = `zztest8-${Date.now()}-${seq++}@example.com`;
  emails.push(email);
  const roles = await prisma.role.findMany({ where: { name: { in: opts.roles ?? ['ZZTEST8_A'] } } });
  return prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(PASSWORD),
      isActive: opts.isActive ?? true,
      mustChangePassword: opts.mustChangePassword ?? false,
      roles: { create: roles.map((r) => ({ roleId: r.id })) },
    },
  });
}

const login = (email: string, password = PASSWORD) => request(app).post('/api/auth/login').send({ email, password });
const cookieOf = (res: request.Response) => (res.headers['set-cookie'] as unknown as string[]).map((c) => c.split(';')[0]!);

beforeEach(async () => {
  await prisma.permission.createMany({ data: PERMS.map((key) => ({ key, label: key, module: 'zztest8' })) });
  await prisma.role.create({
    data: { name: 'ZZTEST8_A', permissions: { create: [{ permissionKey: PERMS[0]! }] } },
  });
  await prisma.role.create({
    data: { name: 'ZZTEST8_B', permissions: { create: [{ permissionKey: PERMS[1]! }] } },
  });
});

afterEach(async () => {
  await prisma.user.deleteMany({ where: { email: { in: emails.splice(0) } } });
  await prisma.role.deleteMany({ where: { name: { in: ROLE_NAMES } } });
  await prisma.permission.deleteMany({ where: { module: 'zztest8' } });
});

describe('POST /api/auth/login', () => {
  it('logs in, returns the role permissions and sets an httpOnly refresh cookie', async () => {
    const u = await makeUser();
    const res = await login(u.email);
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.user.permissions).toEqual([PERMS[0]]);
    expect(res.body.user.roles.map((r: { name: string }) => r.name)).toEqual(['ZZTEST8_A']);
    expect(res.body.user).not.toHaveProperty('passwordHash');
    const cookie = (res.headers['set-cookie'] as unknown as string[]).join(';');
    expect(cookie).toContain('refreshToken=');
    expect(cookie).toContain('HttpOnly');
  });

  it('rejects a wrong password', async () => {
    const u = await makeUser();
    const res = await login(u.email, 'nope-nope-nope');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Invalid email or password' });
  });

  it('rejects an inactive user with the same message', async () => {
    const u = await makeUser({ isActive: false });
    const res = await login(u.email);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Invalid email or password' });
  });

  it('rejects an unknown email with the same message', async () => {
    const res = await login('zztest8-nobody@example.com');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Invalid email or password' });
  });

  it('grants the union of permissions across two roles', async () => {
    const u = await makeUser({ roles: ROLE_NAMES });
    const res = await login(u.email);
    expect(res.body.user.permissions).toEqual(PERMS);
  });
});

describe('POST /api/auth/refresh', () => {
  it('rotates the token within the same session; the old cookie stops working', async () => {
    const u = await makeUser();
    const first = cookieOf(await login(u.email));
    const second = await request(app).post('/api/auth/refresh').set('Cookie', first);
    expect(second.status).toBe(200);
    expect(second.body.accessToken).toEqual(expect.any(String));
    const rows = await prisma.refreshToken.findMany({ where: { userId: u.id } });
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.sessionId)).size).toBe(1);
    expect(rows.filter((r) => r.revokedAt === null)).toHaveLength(1);

    const reuse = await request(app).post('/api/auth/refresh').set('Cookie', first);
    expect(reuse.status).toBe(401);
  });

  it('401 without a cookie', async () => {
    expect((await request(app).post('/api/auth/refresh')).status).toBe(401);
  });

  it('reflects permissions removed from a role since login', async () => {
    const u = await makeUser({ roles: ROLE_NAMES });
    const res = await login(u.email);
    expect(res.body.user.permissions).toEqual(PERMS);
    await prisma.rolePermission.deleteMany({ where: { permissionKey: PERMS[1]! } });
    const refreshed = await request(app).post('/api/auth/refresh').set('Cookie', cookieOf(res));
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.user.permissions).toEqual([PERMS[0]]);
  });

  it('401s and revokes the session when the user was deactivated', async () => {
    const u = await makeUser();
    const cookie = cookieOf(await login(u.email));
    await prisma.user.update({ where: { id: u.id }, data: { isActive: false } });
    const res = await request(app).post('/api/auth/refresh').set('Cookie', cookie);
    expect(res.status).toBe(401);
    const rows = await prisma.refreshToken.findMany({ where: { userId: u.id } });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.revokedAt !== null)).toBe(true);
  });
});

describe('POST /api/auth/logout', () => {
  it('revokes the token and clears the cookie', async () => {
    const u = await makeUser();
    const cookie = cookieOf(await login(u.email));
    const out = await request(app).post('/api/auth/logout').set('Cookie', cookie);
    expect(out.status).toBe(200);
    expect(out.body).toEqual({ success: true });
    expect((out.headers['set-cookie'] as unknown as string[]).join(';')).toMatch(/refreshToken=;/);
    expect((await request(app).post('/api/auth/refresh').set('Cookie', cookie)).status).toBe(401);
  });
});

describe('GET /api/auth/me', () => {
  it('401 without a token, user with one', async () => {
    const u = await makeUser();
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
    const { body } = await login(u.email);
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${body.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.email).toBe(u.email);
    expect(me.body.permissions).toEqual([PERMS[0]]);
  });
});

describe('sessions', () => {
  it('lists sessions marking the current one and revokes another', async () => {
    const u = await makeUser();
    const a = await login(u.email).set('User-Agent', 'Mozilla/5.0 (X11; Linux x86_64) Chrome/120.0');
    const b = await login(u.email);
    const auth = { Authorization: `Bearer ${a.body.accessToken}` };
    const list = await request(app).get('/api/auth/sessions').set(auth).set('Cookie', cookieOf(a));
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(2);
    const current = list.body.find((s: { current: boolean }) => s.current);
    expect(current.device).toBe('Chrome on Linux');
    const other = list.body.find((s: { current: boolean }) => !s.current);

    const own = await request(app).delete(`/api/auth/sessions/${current.sessionId}`).set(auth).set('Cookie', cookieOf(a));
    expect(own.status).toBe(409);
    const del = await request(app).delete(`/api/auth/sessions/${other.sessionId}`).set(auth).set('Cookie', cookieOf(a));
    expect(del.status).toBe(204);
    expect((await request(app).post('/api/auth/refresh').set('Cookie', cookieOf(b))).status).toBe(401);
  });
});

describe('POST /api/auth/change-password', () => {
  it('400 for a wrong current password', async () => {
    const u = await makeUser({ mustChangePassword: true });
    const { body } = await login(u.email);
    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${body.accessToken}`)
      .send({ currentPassword: 'wrong-wrong', newPassword: 'brand-new-pass-1' });
    expect(res.status).toBe(400);
  });

  it('changes the password, clears the flag and revokes other sessions', async () => {
    const u = await makeUser({ mustChangePassword: true });
    const a = await login(u.email);
    const b = await login(u.email);
    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${a.body.accessToken}`)
      .set('Cookie', cookieOf(a))
      .send({ currentPassword: PASSWORD, newPassword: 'brand-new-pass-1' });
    expect(res.status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).mustChangePassword).toBe(false);
    expect((await request(app).post('/api/auth/refresh').set('Cookie', cookieOf(b))).status).toBe(401);
    expect((await request(app).post('/api/auth/refresh').set('Cookie', cookieOf(a))).status).toBe(200);
    expect((await login(u.email)).status).toBe(401);
    expect((await login(u.email, 'brand-new-pass-1')).status).toBe(200);
  });
});
