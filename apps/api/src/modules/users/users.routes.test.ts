import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hashPassword } from '@erp/auth';
import { prisma } from '@erp/db';
import { createApp } from '../../app.js';
import { bearer, ensureTestSuperAdmin } from '../../test-utils/access.js';

const app = createApp();
const PREFIX = 'zztest9u';
const ROLE = `${PREFIX.toUpperCase()}_ROLE`;
const ROLE_B = `${PREFIX.toUpperCase()}_ROLE_B`;
const PERM = 'zztest9u.read';

const userManager = (...extra: string[]) => bearer('actor', 'STANDARD', ['user.manage', ...extra]);

let seq = 0;
async function makeUser(opts: { role?: string | null; accessLevel?: 'ADMIN' | 'STANDARD'; isActive?: boolean } = {}) {
  const role = opts.role === null ? null : await prisma.role.findUnique({ where: { name: opts.role ?? ROLE } });
  return prisma.user.create({
    data: {
      email: `${PREFIX}-${Date.now()}-${seq++}@example.com`,
      displayName: `${PREFIX} person`,
      passwordHash: await hashPassword('correct-horse-9'),
      isActive: opts.isActive ?? true,
      accessLevel: opts.accessLevel ?? 'STANDARD',
      roleId: opts.accessLevel === 'ADMIN' ? null : (role?.id ?? null),
    },
  });
}

const auditRows = (entityId: string) => prisma.auditLog.findMany({ where: { entityId } });
const roleIdOf = async (name: string) => (await prisma.role.findUniqueOrThrow({ where: { name } })).id;

async function clean() {
  const users = await prisma.user.findMany({ where: { email: { startsWith: PREFIX } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  await prisma.auditLog.deleteMany({ where: { entityId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.role.deleteMany({ where: { name: { in: [ROLE, ROLE_B] } } });
  await prisma.permission.deleteMany({ where: { module: PREFIX } });
}

beforeEach(async () => {
  await clean();
  await prisma.permission.create({ data: { key: PERM, label: 'r', module: PREFIX, scopes: ['OWN', 'TEAM', 'DEPARTMENT', 'ALL'] } });
  await prisma.role.createMany({ data: [{ name: ROLE }, { name: ROLE_B }] });
});

afterEach(clean);

describe('permission gate', () => {
  it('403 without user.manage on every users route', async () => {
    const h = bearer('actor', 'STANDARD', ['role.manage']);
    const calls = [
      request(app).get('/api/users').set(h),
      request(app).get('/api/users/role-options').set(h),
      request(app).post('/api/users').set(h).send({}),
      request(app).patch('/api/users/x/role').set(h).send({ roleId: null }),
      request(app).patch('/api/users/x/access-level').set(h).send({ accessLevel: 'ADMIN' }),
      request(app).patch('/api/users/x/status').set(h).send({ isActive: false }),
    ];
    for (const res of await Promise.all(calls)) expect(res.status).toBe(403);
  });

  it('the old multi-role endpoint is gone', async () => {
    const res = await request(app).patch('/api/users/x/roles').set(userManager()).send({ roleIds: [] });
    expect(res.status).toBe(404);
  });
});

describe('GET /api/users/role-options', () => {
  it('200 with user.manage, id and name only, ordered by name', async () => {
    const res = await request(app).get('/api/users/role-options').set(userManager());
    expect(res.status).toBe(200);
    const names = res.body.map((r: { name: string }) => r.name);
    expect(names.indexOf(ROLE)).toBeLessThan(names.indexOf(ROLE_B));
    expect(Object.keys(res.body[0]).sort()).toEqual(['id', 'name']);
  });
});

describe('GET /api/users', () => {
  it('filters by q on email/displayName and orders by email', async () => {
    const a = await makeUser();
    const b = await makeUser();
    const res = await request(app).get('/api/users').query({ q: PREFIX }).set(userManager());
    expect(res.status).toBe(200);
    expect(res.body.map((u: { email: string }) => u.email)).toEqual([a.email, b.email].sort());
    expect(res.body[0]).not.toHaveProperty('passwordHash');
    const none = await request(app).get('/api/users').query({ q: `${PREFIX}-nomatch` }).set(userManager());
    expect(none.body).toEqual([]);
  });
});

describe('POST /api/users', () => {
  it('creates a STANDARD user with a temporary password and a role, and audits it', async () => {
    const roleId = await roleIdOf(ROLE);
    const email = `${PREFIX}-new-${Date.now()}@example.com`;
    const res = await request(app).post('/api/users').set(userManager()).send({ email, displayName: 'New Person', roleId });
    expect(res.status).toBe(201);
    expect(res.body.temporaryPassword.length).toBeGreaterThanOrEqual(12);
    expect(res.body.user).toMatchObject({ mustChangePassword: true, accessLevel: 'STANDARD', role: { name: ROLE } });

    const login = await request(app).post('/api/auth/login').send({ email, password: res.body.temporaryPassword });
    expect(login.status).toBe(200);

    const rows = await auditRows(res.body.user.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ entity: 'USER', action: 'CREATE', changedBy: 'actor' });
    expect(JSON.stringify(rows[0])).not.toContain(res.body.temporaryPassword);
  });

  it('the role is optional and an accessLevel in the body is ignored: always STANDARD', async () => {
    const email = `${PREFIX}-norole-${Date.now()}@example.com`;
    const res = await request(app)
      .post('/api/users')
      .set(userManager())
      .send({ email, displayName: 'No Role', accessLevel: 'SUPER_ADMIN' });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ accessLevel: 'STANDARD', role: null });
  });

  it('409 for a duplicate email, 400 for an unknown role', async () => {
    const u = await makeUser();
    const roleId = await roleIdOf(ROLE);
    const dup = await request(app).post('/api/users').set(userManager()).send({ email: u.email, displayName: 'X', roleId });
    expect(dup.status).toBe(409);
    const bad = await request(app)
      .post('/api/users')
      .set(userManager())
      .send({ email: `${PREFIX}-x@example.com`, displayName: 'X', roleId: 'nope' });
    expect(bad.status).toBe(400);
  });
});

describe('PATCH /api/users/:id/role', () => {
  it('sets and clears the single role, one audit row each', async () => {
    const u = await makeUser();
    const set = await request(app).patch(`/api/users/${u.id}/role`).set(userManager()).send({ roleId: await roleIdOf(ROLE_B) });
    expect(set.status).toBe(200);
    expect(set.body.role.name).toBe(ROLE_B);
    const cleared = await request(app).patch(`/api/users/${u.id}/role`).set(userManager()).send({ roleId: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.role).toBeNull();
    const rows = await auditRows(u.id);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ entity: 'USER', action: 'UPDATE' });
  });

  it('a role array is not accepted: 400', async () => {
    const u = await makeUser();
    const res = await request(app).patch(`/api/users/${u.id}/role`).set(userManager()).send({ roleId: [await roleIdOf(ROLE)] });
    expect(res.status).toBe(400);
  });

  it('404 for an unknown user, 400 for an unknown role', async () => {
    const u = await makeUser();
    expect((await request(app).patch('/api/users/nope/role').set(userManager()).send({ roleId: null })).status).toBe(404);
    expect((await request(app).patch(`/api/users/${u.id}/role`).set(userManager()).send({ roleId: 'nope' })).status).toBe(400);
  });

  it('an ADMIN takes no role: 409 for the super admin caller, 403 for an admin caller', async () => {
    const sa = await ensureTestSuperAdmin();
    const target = await makeUser({ accessLevel: 'ADMIN' });
    const roleId = await roleIdOf(ROLE);
    const asSuper = await request(app).patch(`/api/users/${target.id}/role`).set(bearer(sa.id, 'SUPER_ADMIN')).send({ roleId });
    expect(asSuper.status).toBe(409);
    const asAdmin = await request(app).patch(`/api/users/${target.id}/role`).set(bearer('adm', 'ADMIN')).send({ roleId });
    expect(asAdmin.status).toBe(403);
  });
});

describe('PATCH /api/users/:id/status', () => {
  it('deactivating revokes every refresh token and audits once', async () => {
    const u = await makeUser();
    const login = await request(app).post('/api/auth/login').send({ email: u.email, password: 'correct-horse-9' });
    expect(login.status).toBe(200);
    const res = await request(app).patch(`/api/users/${u.id}/status`).set(userManager()).send({ isActive: false });
    expect(res.status).toBe(200);
    expect(res.body.isActive).toBe(false);
    expect(await prisma.refreshToken.count({ where: { userId: u.id, revokedAt: null } })).toBe(0);
    const rows = await auditRows(u.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ entity: 'USER', action: 'UPDATE' });
  });
});

describe('Review Focus 1: the super admin is untouchable', () => {
  const mutations = (id: string, roleId: string) => [
    ['status', 'patch', `/api/users/${id}/status`, { isActive: false }],
    ['role', 'patch', `/api/users/${id}/role`, { roleId }],
    ['access-level', 'patch', `/api/users/${id}/access-level`, { accessLevel: 'STANDARD' }],
  ] as const;

  it.each([
    ['the super admin on themselves', (id: string) => bearer(id, 'SUPER_ADMIN')],
    ['an admin', () => bearer('adm', 'ADMIN')],
    ['a user.manage holder', () => userManager()],
  ])('403 on every mutation of the super admin by %s', async (_who, header) => {
    const sa = await ensureTestSuperAdmin();
    const roleId = await roleIdOf(ROLE);
    for (const [, , path, body] of mutations(sa.id, roleId)) {
      const res = await request(app).patch(path).set(header(sa.id)).send(body);
      expect(res.status, path).toBe(403);
    }
    const after = await prisma.user.findUniqueOrThrow({ where: { id: sa.id } });
    expect(after).toMatchObject({ isActive: true, accessLevel: 'SUPER_ADMIN', roleId: null });
  });

  it('a second SUPER_ADMIN row cannot be inserted or promoted to, at the database level', async () => {
    await ensureTestSuperAdmin();
    const u = await makeUser();
    await expect(prisma.user.update({ where: { id: u.id }, data: { accessLevel: 'SUPER_ADMIN' } })).rejects.toThrow();
    await expect(
      prisma.user.create({ data: { email: `${PREFIX}-dup-sa@example.com`, passwordHash: 'x', accessLevel: 'SUPER_ADMIN' } }),
    ).rejects.toThrow();
  });
});

describe('Review Focus 2: admins and escalation', () => {
  it('an admin may deactivate a STANDARD user but not another admin; the super admin may', async () => {
    const sa = await ensureTestSuperAdmin();
    const standard = await makeUser();
    const otherAdmin = await makeUser({ accessLevel: 'ADMIN' });
    const asAdmin = bearer('adm', 'ADMIN');

    expect((await request(app).patch(`/api/users/${standard.id}/status`).set(asAdmin).send({ isActive: false })).status).toBe(200);
    expect((await request(app).patch(`/api/users/${otherAdmin.id}/status`).set(asAdmin).send({ isActive: false })).status).toBe(403);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: otherAdmin.id } })).isActive).toBe(true);
    const asSuper = await request(app)
      .patch(`/api/users/${otherAdmin.id}/status`)
      .set(bearer(sa.id, 'SUPER_ADMIN'))
      .send({ isActive: false });
    expect(asSuper.status).toBe(200);
  });

  it('a user.manage holder cannot touch an admin', async () => {
    const admin = await makeUser({ accessLevel: 'ADMIN' });
    const res = await request(app).patch(`/api/users/${admin.id}/status`).set(userManager()).send({ isActive: false });
    expect(res.status).toBe(403);
  });

  describe('assigning a role (scope-aware escalation)', () => {
    async function roleWith(permissionKey: string, scope: 'DEPARTMENT' | 'ALL') {
      return prisma.role.update({ where: { name: ROLE_B }, data: { permissions: { create: [{ permissionKey, scope }] } } });
    }
    const GRANT = 'Cannot grant permissions you do not hold';

    it('403 for a role with a wider scope than the caller holds (PATCH and create)', async () => {
      const wide = await roleWith(PERM, 'ALL');
      const u = await makeUser();
      const caller = userManager(`${PERM}:department`);
      const patch = await request(app).patch(`/api/users/${u.id}/role`).set(caller).send({ roleId: wide.id });
      expect(patch.status).toBe(403);
      expect(patch.body.error).toBe(GRANT);
      const create = await request(app)
        .post('/api/users')
        .set(caller)
        .send({ email: `${PREFIX}-esc-${Date.now()}@example.com`, displayName: 'X', roleId: wide.id });
      expect(create.status).toBe(403);
    });

    it('200 for a role whose scope the caller covers', async () => {
      const dept = await roleWith(PERM, 'DEPARTMENT');
      const u = await makeUser();
      const res = await request(app).patch(`/api/users/${u.id}/role`).set(userManager(`${PERM}:all`)).send({ roleId: dept.id });
      expect(res.status).toBe(200);
    });

    it('403 for a role carrying a permission the caller lacks outright', async () => {
      await prisma.rolePermission.create({ data: { roleId: await roleIdOf(ROLE_B), permissionKey: 'role.manage' } });
      const u = await makeUser();
      const res = await request(app).patch(`/api/users/${u.id}/role`).set(userManager()).send({ roleId: await roleIdOf(ROLE_B) });
      expect(res.status).toBe(403);
    });

    it('an ADMIN may assign any role', async () => {
      const wide = await roleWith(PERM, 'ALL');
      const u = await makeUser();
      const res = await request(app).patch(`/api/users/${u.id}/role`).set(bearer('adm', 'ADMIN')).send({ roleId: wide.id });
      expect(res.status).toBe(200);
    });
  });
});
