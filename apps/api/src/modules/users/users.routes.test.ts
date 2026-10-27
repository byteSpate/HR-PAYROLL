import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hashPassword, signAccessToken } from '@erp/auth';
import { allPermissions } from '@erp/contracts';
import { prisma } from '@erp/db';
import { createApp } from '../../app.js';
import { env } from '../../env.js';

const app = createApp();
const PREFIX = 'zztest9u';
const ROLE = `${PREFIX.toUpperCase()}_ROLE`;
const ROLE_B = `${PREFIX.toUpperCase()}_ROLE_B`;

const token = (permissions: string[]) => signAccessToken({ sub: 'actor', permissions }, env.JWT_ACCESS_SECRET, '5m');
// Holds every permission, so it may grant any role (SUPER_ADMIN included).
const admin = () => ({ Authorization: `Bearer ${token(allPermissions().map((p) => p.key))}` });
const userManager = () => ({ Authorization: `Bearer ${token(['user.manage'])}` });

let seq = 0;
async function makeUser(roleNames: string[] = [ROLE], isActive = true) {
  const roles = await prisma.role.findMany({ where: { name: { in: roleNames } } });
  return prisma.user.create({
    data: {
      email: `${PREFIX}-${Date.now()}-${seq++}@example.com`,
      displayName: `${PREFIX} person`,
      passwordHash: await hashPassword('correct-horse-9'),
      isActive,
      roles: { create: roles.map((r) => ({ roleId: r.id })) },
    },
  });
}

const auditRows = (entityId: string) => prisma.auditLog.findMany({ where: { entityId } });
const roleIdOf = async (name: string) => (await prisma.role.findUniqueOrThrow({ where: { name } })).id;

// Seeded super admins (non-fixture) switched off for a test; restored in finally and in afterEach.
let parked: string[] = [];
async function parkOtherSuperAdmins() {
  const others = await prisma.user.findMany({
    where: { isActive: true, email: { not: { startsWith: PREFIX } }, roles: { some: { role: { name: 'SUPER_ADMIN' } } } },
    select: { id: true },
  });
  parked.push(...others.map((u) => u.id));
  await prisma.user.updateMany({ where: { id: { in: parked } }, data: { isActive: false } });
}
async function restoreParked() {
  await prisma.user.updateMany({ where: { id: { in: parked } }, data: { isActive: true } });
  parked = [];
}

async function clean() {
  const users = await prisma.user.findMany({ where: { email: { startsWith: PREFIX } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  await prisma.auditLog.deleteMany({ where: { entityId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.role.deleteMany({ where: { name: { in: [ROLE, ROLE_B] } } });
}

beforeEach(async () => {
  await clean();
  await prisma.role.createMany({ data: [{ name: ROLE }, { name: ROLE_B }] });
});

afterEach(async () => {
  await restoreParked();
  await clean();
});

describe('permission gate', () => {
  it('403 without user.manage on every users route', async () => {
    const h = { Authorization: `Bearer ${token(['role.manage'])}` };
    const calls = [
      request(app).get('/api/users').set(h),
      request(app).get('/api/users/role-options').set(h),
      request(app).post('/api/users').set(h).send({}),
      request(app).patch('/api/users/x/roles').set(h).send({ roleIds: [] }),
      request(app).patch('/api/users/x/status').set(h).send({ isActive: false }),
    ];
    for (const res of await Promise.all(calls)) expect(res.status).toBe(403);
  });
});

describe('GET /api/users/role-options', () => {
  it('200 with user.manage, id and name only, ordered by name', async () => {
    const res = await request(app).get('/api/users/role-options').set(userManager());
    expect(res.status).toBe(200);
    const names = res.body.map((r: { name: string }) => r.name);
    expect(names.indexOf(ROLE)).toBeLessThan(names.indexOf(ROLE_B));
    expect(names).toEqual(expect.arrayContaining([ROLE, ROLE_B]));
    expect(Object.keys(res.body[0]).sort()).toEqual(['id', 'name']);
  });
});

describe('GET /api/users', () => {
  it('filters by q on email/displayName and orders by email', async () => {
    const a = await makeUser();
    const b = await makeUser();
    const res = await request(app).get('/api/users').query({ q: PREFIX }).set(userManager());
    expect(res.status).toBe(200);
    const emails = res.body.map((u: { email: string }) => u.email);
    expect(emails).toEqual([a.email, b.email].sort());
    expect(res.body[0]).not.toHaveProperty('passwordHash');
    const none = await request(app).get('/api/users').query({ q: `${PREFIX}-nomatch` }).set(userManager());
    expect(none.body).toEqual([]);
  });
});

describe('POST /api/users', () => {
  it('creates a user with a temporary password they can log in with, and audits it', async () => {
    const roleId = await roleIdOf(ROLE);
    const email = `${PREFIX}-new-${Date.now()}@example.com`;
    const res = await request(app).post('/api/users').set(userManager()).send({ email, displayName: 'New Person', roleIds: [roleId] });
    expect(res.status).toBe(201);
    expect(res.body.temporaryPassword.length).toBeGreaterThanOrEqual(12);
    expect(res.body.user.mustChangePassword).toBe(true);
    expect(res.body.user.roles.map((r: { name: string }) => r.name)).toEqual([ROLE]);

    const login = await request(app).post('/api/auth/login').send({ email, password: res.body.temporaryPassword });
    expect(login.status).toBe(200);

    const rows = await auditRows(res.body.user.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ entity: 'USER', action: 'CREATE', changedBy: 'actor' });
    expect(JSON.stringify(rows[0])).not.toContain(res.body.temporaryPassword);
  });

  it('409 for a duplicate email, 400 for an unknown role', async () => {
    const u = await makeUser();
    const roleId = await roleIdOf(ROLE);
    const dup = await request(app).post('/api/users').set(userManager()).send({ email: u.email, displayName: 'X', roleIds: [roleId] });
    expect(dup.status).toBe(409);
    const bad = await request(app)
      .post('/api/users')
      .set(userManager())
      .send({ email: `${PREFIX}-x@example.com`, displayName: 'X', roleIds: ['nope'] });
    expect(bad.status).toBe(400);
  });

  it('granting SUPER_ADMIN on create needs role.manage', async () => {
    const superId = await roleIdOf('SUPER_ADMIN');
    const res = await request(app)
      .post('/api/users')
      .set(userManager())
      .send({ email: `${PREFIX}-sa-${Date.now()}@example.com`, displayName: 'X', roleIds: [superId] });
    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/users/:id/roles', () => {
  it('replaces roles and writes one audit row', async () => {
    const u = await makeUser();
    const res = await request(app)
      .patch(`/api/users/${u.id}/roles`)
      .set(userManager())
      .send({ roleIds: [await roleIdOf(ROLE_B)] });
    expect(res.status).toBe(200);
    expect(res.body.roles.map((r: { name: string }) => r.name)).toEqual([ROLE_B]);
    const rows = await auditRows(u.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ entity: 'USER', action: 'UPDATE' });
  });

  it('adding or removing SUPER_ADMIN needs role.manage', async () => {
    const u = await makeUser();
    const superId = await roleIdOf('SUPER_ADMIN');
    const denied = await request(app).patch(`/api/users/${u.id}/roles`).set(userManager()).send({ roleIds: [superId] });
    expect(denied.status).toBe(403);
    const ok = await request(app).patch(`/api/users/${u.id}/roles`).set(admin()).send({ roleIds: [superId] });
    expect(ok.status).toBe(200);
    const removeDenied = await request(app).patch(`/api/users/${u.id}/roles`).set(userManager()).send({ roleIds: [] });
    expect(removeDenied.status).toBe(403);
  });

  it('404 for an unknown user, 400 for an unknown role', async () => {
    const u = await makeUser();
    expect((await request(app).patch('/api/users/nope/roles').set(userManager()).send({ roleIds: [] })).status).toBe(404);
    expect((await request(app).patch(`/api/users/${u.id}/roles`).set(userManager()).send({ roleIds: ['nope'] })).status).toBe(400);
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

describe('privilege escalation', () => {
  const GRANT = 'Cannot grant a role with permissions you do not hold';
  async function roleWithPerm(permissionKey: string) {
    return prisma.role.update({
      where: { name: ROLE_B },
      data: { permissions: { create: [{ permissionKey }] } },
    });
  }

  it('adding a role with a permission the caller lacks -> 403 (create and PATCH)', async () => {
    const heavy = await roleWithPerm('role.manage');
    const u = await makeUser();
    const patch = await request(app).patch(`/api/users/${u.id}/roles`).set(userManager()).send({ roleIds: [heavy.id] });
    expect(patch.status).toBe(403);
    expect(patch.body.error).toBe(GRANT);
    const create = await request(app)
      .post('/api/users')
      .set(userManager())
      .send({ email: `${PREFIX}-esc-${Date.now()}@example.com`, displayName: 'X', roleIds: [heavy.id] });
    expect(create.status).toBe(403);
    expect(create.body.error).toBe(GRANT);
  });

  it('a caller holding every permission of the role may add it', async () => {
    const heavy = await roleWithPerm('role.manage');
    const u = await makeUser();
    const res = await request(app).patch(`/api/users/${u.id}/roles`).set(admin()).send({ roleIds: [heavy.id] });
    expect(res.status).toBe(200);
  });

  it('user.manage alone cannot deactivate or change roles of a SUPER_ADMIN', async () => {
    const sa = await makeUser(['SUPER_ADMIN']);
    const status = await request(app).patch(`/api/users/${sa.id}/status`).set(userManager()).send({ isActive: false });
    expect(status.status).toBe(403);
    const roles = await request(app).patch(`/api/users/${sa.id}/roles`).set(userManager()).send({ roleIds: [] });
    expect(roles.status).toBe(403);
    const keep = await prisma.user.findUniqueOrThrow({ where: { id: sa.id } });
    expect(keep.isActive).toBe(true);
  });
});

describe('last super admin (Review Focus 2)', () => {
  // The dev DB already holds a seeded active super admin, so each test parks every non-fixture
  // super admin first; the fixture alone then decides the count, whatever the DB contains.
  it('with one active super admin: removing SUPER_ADMIN -> 409, deactivating -> 409', async () => {
    const sole = await makeUser(['SUPER_ADMIN']);
    try {
      await parkOtherSuperAdmins();
      const remove = await request(app).patch(`/api/users/${sole.id}/roles`).set(admin()).send({ roleIds: [] });
      expect(remove.status).toBe(409);
      expect(remove.body.error).toBe('At least one active super admin is required');
      const deactivate = await request(app).patch(`/api/users/${sole.id}/status`).set(admin()).send({ isActive: false });
      expect(deactivate.status).toBe(409);
      const still = await prisma.user.findUniqueOrThrow({ where: { id: sole.id }, include: { roles: true } });
      expect(still.isActive).toBe(true);
      expect(still.roles).toHaveLength(1);
    } finally {
      await restoreParked();
    }
  });

  it('with two active super admins: removing one -> 200', async () => {
    const a = await makeUser(['SUPER_ADMIN']);
    await makeUser(['SUPER_ADMIN']);
    try {
      await parkOtherSuperAdmins();
      const res = await request(app).patch(`/api/users/${a.id}/roles`).set(admin()).send({ roleIds: [] });
      expect(res.status).toBe(200);
    } finally {
      await restoreParked();
    }
  });

  it('an inactive super admin does not count as a spare', async () => {
    const sole = await makeUser(['SUPER_ADMIN']);
    await makeUser(['SUPER_ADMIN'], false);
    try {
      await parkOtherSuperAdmins();
      const res = await request(app).patch(`/api/users/${sole.id}/status`).set(admin()).send({ isActive: false });
      expect(res.status).toBe(409);
    } finally {
      await restoreParked();
    }
  });
});
