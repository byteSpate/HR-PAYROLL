import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hashPassword, verifyAccessToken } from '@erp/auth';
import { prisma } from '@erp/db';
import { createApp } from '../../app.js';
import { env } from '../../env.js';
import { resetRateLimits } from '../../middleware/rate-limit.js';

const app = createApp();
const PASSWORD = 'correct-horse-9';
const PERMS = ['zztest8.read', 'zztest8.write'];
const ROLE_NAMES = ['ZZTEST8_A'];

let seq = 0;
const emails: string[] = [];

async function makeUser(
  opts: { role?: string | null; accessLevel?: 'ADMIN' | 'STANDARD'; isActive?: boolean; mustChangePassword?: boolean } = {},
) {
  const email = `zztest8-${Date.now()}-${seq++}@example.com`;
  emails.push(email);
  const role = opts.role === null ? null : await prisma.role.findUnique({ where: { name: opts.role ?? 'ZZTEST8_A' } });
  return prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(PASSWORD),
      isActive: opts.isActive ?? true,
      mustChangePassword: opts.mustChangePassword ?? false,
      accessLevel: opts.accessLevel ?? 'STANDARD',
      roleId: role?.id ?? null,
    },
  });
}

const login = (email: string, password = PASSWORD) => request(app).post('/api/auth/login').send({ email, password });
const cookieOf = (res: request.Response) => (res.headers['set-cookie'] as unknown as string[]).map((c) => c.split(';')[0]!);

beforeEach(async () => {
  resetRateLimits();
  await prisma.permission.create({
    data: { key: PERMS[0]!, label: 'read', module: 'zztest8', scopes: ['OWN', 'TEAM', 'DEPARTMENT', 'ALL'] },
  });
  await prisma.permission.create({ data: { key: PERMS[1]!, label: 'write', module: 'zztest8' } });
  await prisma.role.create({
    data: {
      name: 'ZZTEST8_A',
      permissions: { create: [{ permissionKey: PERMS[0]!, scope: 'DEPARTMENT' }, { permissionKey: PERMS[1]! }] },
    },
  });
});

afterEach(async () => {
  await prisma.user.deleteMany({ where: { email: { in: emails.splice(0) } } });
  await prisma.role.deleteMany({ where: { name: { in: ROLE_NAMES } } });
  await prisma.permission.deleteMany({ where: { module: 'zztest8' } });
});

describe('POST /api/auth/login', () => {
  it('logs in, returns the role grants and sets an httpOnly refresh cookie', async () => {
    const u = await makeUser();
    const res = await login(u.email);
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.user.grants).toEqual(['zztest8.read:department', 'zztest8.write']);
    expect(res.body.user.accessLevel).toBe('STANDARD');
    expect(res.body.user.role.name).toBe('ZZTEST8_A');
    expect(res.body.user).not.toHaveProperty('roles');
    expect(verifyAccessToken(res.body.accessToken, env.JWT_ACCESS_SECRET)).toMatchObject({
      sub: u.id,
      accessLevel: 'STANDARD',
      grants: ['zztest8.read:department', 'zztest8.write'],
    });
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

  it('an ADMIN gets an empty grant list in both the token and the user', async () => {
    const u = await makeUser({ accessLevel: 'ADMIN', role: null });
    const res = await login(u.email);
    expect(res.body.user).toMatchObject({ accessLevel: 'ADMIN', role: null, grants: [] });
    expect(verifyAccessToken(res.body.accessToken, env.JWT_ACCESS_SECRET)).toMatchObject({ accessLevel: 'ADMIN', grants: [] });
  });

  it('a STANDARD user without a role has no grants', async () => {
    const u = await makeUser({ role: null });
    const res = await login(u.email);
    expect(res.body.user).toMatchObject({ accessLevel: 'STANDARD', role: null, grants: [] });
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

  it('reflects grants removed from a role since login', async () => {
    const u = await makeUser();
    const res = await login(u.email);
    expect(res.body.user.grants).toHaveLength(2);
    await prisma.rolePermission.deleteMany({ where: { permissionKey: PERMS[1]! } });
    const refreshed = await request(app).post('/api/auth/refresh').set('Cookie', cookieOf(res));
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.user.grants).toEqual(['zztest8.read:department']);
    expect(verifyAccessToken(refreshed.body.accessToken, env.JWT_ACCESS_SECRET).grants).toEqual(['zztest8.read:department']);
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
    expect(me.body.grants).toEqual(['zztest8.read:department', 'zztest8.write']);
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

describe('email case', () => {
  it('logs in regardless of case and surrounding whitespace', async () => {
    const email = `zztest8-Mixed${Date.now()}@Example.com`;
    emails.push(email.toLowerCase());
    await prisma.user.create({
      data: { email: email.toLowerCase(), passwordHash: await hashPassword(PASSWORD) },
    });
    expect((await login(email.toUpperCase())).status).toBe(200);
    expect((await login(` ${email.toLowerCase()} `)).status).toBe(200);
  });
});

describe('rate limits', () => {
  it('answers 429 with Retry-After on the 11th login attempt in the window', async () => {
    for (let i = 0; i < 10; i++) expect((await login('zztest8-nobody@example.com', 'x')).status).toBe(401);
    const res = await login('zztest8-nobody@example.com', 'x');
    expect(res.status).toBe(429);
    expect(res.body).toEqual({ error: 'Too many attempts, try again later' });
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
  });
});
