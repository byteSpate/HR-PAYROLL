import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hashPassword } from '@erp/auth';
import { prisma } from '@erp/db';
import { createApp } from '../../app.js';
import { bearer, cleanActors, ensureTestSuperAdmin, makeActor } from '../../test-utils/access.js';

const app = createApp();
const PREFIX = 'zztest9u';
const ROLE = `${PREFIX.toUpperCase()}_ROLE`;
const ROLE_B = `${PREFIX.toUpperCase()}_ROLE_B`;
const PERM = 'zztest9u.read';

const userManager = async (...extra: string[]) => (await makeActor(PREFIX, 'STANDARD', ['user.manage', ...extra])).header;
const adminActor = async () => (await makeActor(PREFIX, 'ADMIN')).header;

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
  await cleanActors(PREFIX);
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
    const h = (await makeActor(PREFIX, 'STANDARD', ['role.manage'])).header;
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
    const res = await request(app).patch('/api/users/x/roles').set(await userManager()).send({ roleIds: [] });
    expect(res.status).toBe(404);
  });
});

describe('GET /api/users/role-options', () => {
  it('200 with user.manage, id and name only, ordered by name', async () => {
    const res = await request(app).get('/api/users/role-options').set(await userManager());
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
    const res = await request(app).get('/api/users').query({ q: PREFIX }).set(await userManager());
    expect(res.status).toBe(200);
    // Actor accounts made for the request share the prefix; they are not under test here.
    const emails = res.body.map((u: { email: string }) => u.email).filter((e: string) => !e.includes('-actor-'));
    expect(emails).toEqual([a.email, b.email].sort());
    expect(res.body[0]).not.toHaveProperty('passwordHash');
    const none = await request(app).get('/api/users').query({ q: `${PREFIX}-nomatch` }).set(await userManager());
    expect(none.body).toEqual([]);
  });

  it('says when each account was opened and which employee, if any, it belongs to', async () => {
    const staff = await makeUser();
    const department = await prisma.department.create({ data: { name: `${PREFIX}-dept-${Date.now()}` } });
    const employee = await prisma.employee.create({
      data: { userId: staff.id, employeeCode: `${PREFIX}-${Date.now()}`, fullName: 'Pat Staff', designation: 'Engineer', departmentId: department.id, employmentType: 'FULL_TIME', joiningDate: new Date('2026-01-01T00:00:00Z') },
    });
    const bare = await makeUser();
    try {
      const res = await request(app).get('/api/users').query({ q: PREFIX }).set(await userManager());
      const byId = new Map<string, { createdAt: string; employee: unknown }>(res.body.map((u: { id: string; createdAt: string; employee: unknown }) => [u.id, u]));
      expect(byId.get(staff.id)?.employee).toEqual({ fullName: 'Pat Staff', employeeCode: employee.employeeCode });
      expect(byId.get(bare.id)?.employee).toBeNull();
      expect(new Date(byId.get(bare.id)!.createdAt).toISOString()).toBe(bare.createdAt.toISOString());
    } finally {
      await prisma.employee.delete({ where: { id: employee.id } });
      await prisma.department.delete({ where: { id: department.id } });
    }
  });
});

describe('POST /api/users', () => {
  it('creates a STANDARD user with a temporary password and a role, and audits it', async () => {
    const roleId = await roleIdOf(ROLE);
    const actor = await makeActor(PREFIX, 'STANDARD', ['user.manage']);
    const email = `${PREFIX}-new-${Date.now()}@example.com`;
    const res = await request(app).post('/api/users').set(actor.header).send({ email, displayName: 'New Person', roleId });
    expect(res.status).toBe(201);
    expect(res.body.temporaryPassword.length).toBeGreaterThanOrEqual(12);
    expect(res.body.user).toMatchObject({ mustChangePassword: true, accessLevel: 'STANDARD', role: { name: ROLE } });

    const login = await request(app).post('/api/auth/login').send({ email, password: res.body.temporaryPassword });
    expect(login.status).toBe(200);

    const rows = await auditRows(res.body.user.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ entity: 'USER', action: 'CREATE', changedBy: actor.user.id });
    expect(JSON.stringify(rows[0])).not.toContain(res.body.temporaryPassword);
  });

  it('the role is optional and an accessLevel in the body is ignored: always STANDARD', async () => {
    const email = `${PREFIX}-norole-${Date.now()}@example.com`;
    const res = await request(app)
      .post('/api/users')
      .set(await userManager())
      .send({ email, displayName: 'No Role', accessLevel: 'SUPER_ADMIN' });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ accessLevel: 'STANDARD', role: null });
  });

  it('409 for a duplicate email, 400 for an unknown role', async () => {
    const u = await makeUser();
    const roleId = await roleIdOf(ROLE);
    const dup = await request(app).post('/api/users').set(await userManager()).send({ email: u.email, displayName: 'X', roleId });
    expect(dup.status).toBe(409);
    const bad = await request(app)
      .post('/api/users')
      .set(await userManager())
      .send({ email: `${PREFIX}-x@example.com`, displayName: 'X', roleId: 'nope' });
    expect(bad.status).toBe(400);
  });
});

describe('PATCH /api/users/:id/role', () => {
  it('sets and clears the single role, one audit row each', async () => {
    const u = await makeUser();
    const set = await request(app).patch(`/api/users/${u.id}/role`).set(await userManager()).send({ roleId: await roleIdOf(ROLE_B) });
    expect(set.status).toBe(200);
    expect(set.body.role.name).toBe(ROLE_B);
    const cleared = await request(app).patch(`/api/users/${u.id}/role`).set(await userManager()).send({ roleId: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.role).toBeNull();
    const rows = await auditRows(u.id);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ entity: 'USER', action: 'UPDATE' });
  });

  it('a role array is not accepted: 400', async () => {
    const u = await makeUser();
    const res = await request(app).patch(`/api/users/${u.id}/role`).set(await userManager()).send({ roleId: [await roleIdOf(ROLE)] });
    expect(res.status).toBe(400);
  });

  it('404 for an unknown user, 400 for an unknown role', async () => {
    const u = await makeUser();
    expect((await request(app).patch('/api/users/nope/role').set(await userManager()).send({ roleId: null })).status).toBe(404);
    expect((await request(app).patch(`/api/users/${u.id}/role`).set(await userManager()).send({ roleId: 'nope' })).status).toBe(400);
  });

  it('an ADMIN takes no role: 409 for the super admin caller, 403 for an admin caller', async () => {
    const sa = await ensureTestSuperAdmin();
    const target = await makeUser({ accessLevel: 'ADMIN' });
    const roleId = await roleIdOf(ROLE);
    const asSuper = await request(app).patch(`/api/users/${target.id}/role`).set(bearer(sa.id, 'SUPER_ADMIN')).send({ roleId });
    expect(asSuper.status).toBe(409);
    const asAdmin = await request(app).patch(`/api/users/${target.id}/role`).set(await adminActor()).send({ roleId });
    expect(asAdmin.status).toBe(403);
  });
});

describe('PATCH /api/users/:id/status', () => {
  it('deactivating revokes every refresh token and audits once', async () => {
    const u = await makeUser();
    const login = await request(app).post('/api/auth/login').send({ email: u.email, password: 'correct-horse-9' });
    expect(login.status).toBe(200);
    const res = await request(app).patch(`/api/users/${u.id}/status`).set(await userManager()).send({ isActive: false });
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
    ['an admin', () => adminActor()],
    ['a user.manage holder', () => userManager()],
  ])('403 on every mutation of the super admin by %s', async (_who, header) => {
    const sa = await ensureTestSuperAdmin();
    const roleId = await roleIdOf(ROLE);
    for (const [, , path, body] of mutations(sa.id, roleId)) {
      const res = await request(app).patch(path).set(await header(sa.id)).send(body);
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
    const asAdmin = await adminActor();

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
    const res = await request(app).patch(`/api/users/${admin.id}/status`).set(await userManager()).send({ isActive: false });
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
      const caller = await userManager(`${PERM}:department`);
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
      const res = await request(app).patch(`/api/users/${u.id}/role`).set(await userManager(`${PERM}:all`)).send({ roleId: dept.id });
      expect(res.status).toBe(200);
    });

    it('403 for a role carrying a permission the caller lacks outright', async () => {
      await prisma.rolePermission.create({ data: { roleId: await roleIdOf(ROLE_B), permissionKey: 'role.manage' } });
      const u = await makeUser();
      const res = await request(app).patch(`/api/users/${u.id}/role`).set(await userManager()).send({ roleId: await roleIdOf(ROLE_B) });
      expect(res.status).toBe(403);
    });

    it('an ADMIN may assign any role', async () => {
      const wide = await roleWith(PERM, 'ALL');
      const u = await makeUser();
      const res = await request(app).patch(`/api/users/${u.id}/role`).set(await adminActor()).send({ roleId: wide.id });
      expect(res.status).toBe(200);
    });
  });
});

describe('stale tokens are not honoured (caller re-read from the database)', () => {
  it('after the seat moves, the old super admin token cannot deactivate an admin', async () => {
    const sa = await ensureTestSuperAdmin();
    const next = await makeActor(PREFIX, 'ADMIN');
    const victim = await makeUser({ accessLevel: 'ADMIN' });
    const staleToken = bearer(sa.id, 'SUPER_ADMIN');
    await prisma.user.update({ where: { id: sa.id }, data: { accessLevel: 'ADMIN' } });
    await prisma.user.update({ where: { id: next.user.id }, data: { accessLevel: 'SUPER_ADMIN' } });
    try {
      const res = await request(app).patch(`/api/users/${victim.id}/status`).set(staleToken).send({ isActive: false });
      expect(res.status).toBe(403);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: victim.id } })).isActive).toBe(true);
    } finally {
      await prisma.user.update({ where: { id: next.user.id }, data: { accessLevel: 'ADMIN' } });
      await prisma.user.update({ where: { id: sa.id }, data: { accessLevel: 'SUPER_ADMIN' } });
    }
  });

  it('a deactivated caller with a valid token gets 401', async () => {
    const actor = await makeActor(PREFIX, 'STANDARD', ['user.manage']);
    await prisma.user.update({ where: { id: actor.user.id }, data: { isActive: false } });
    expect((await request(app).get('/api/users').set(actor.header)).status).toBe(200); // reads are not mutations
    const u = await makeUser();
    expect((await request(app).patch(`/api/users/${u.id}/status`).set(actor.header).send({ isActive: false })).status).toBe(401);
  });

  it('a caller whose role lost user.manage gets 403 on mutations despite the token', async () => {
    const actor = await makeActor(PREFIX, 'STANDARD', ['user.manage']);
    await prisma.user.update({ where: { id: actor.user.id }, data: { roleId: null } });
    const u = await makeUser();
    expect((await request(app).patch(`/api/users/${u.id}/status`).set(actor.header).send({ isActive: false })).status).toBe(403);
  });
});
