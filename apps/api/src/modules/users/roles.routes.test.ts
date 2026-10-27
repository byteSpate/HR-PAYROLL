import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hashPassword, signAccessToken } from '@erp/auth';
import { prisma } from '@erp/db';
import { createApp } from '../../app.js';
import { env } from '../../env.js';

const app = createApp();
const PREFIX = 'zztest9r';
const NAME = `${PREFIX.toUpperCase()}_ROLE`;
const NAME_2 = `${PREFIX.toUpperCase()}_RENAMED`;

const token = (permissions: string[]) => signAccessToken({ sub: 'actor', permissions }, env.JWT_ACCESS_SECRET, '5m');
// Holds the permissions the tests hand out: a role editor may only add permissions it holds itself.
const roleAdmin = () => ({ Authorization: `Bearer ${token(['role.manage', 'audit.read', 'user.manage'])}` });

async function clean() {
  const roles = await prisma.role.findMany({ where: { name: { startsWith: PREFIX.toUpperCase() } }, select: { id: true } });
  const ids = roles.map((r) => r.id);
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
  await prisma.auditLog.deleteMany({ where: { entity: 'ROLE', entityId: { in: ids } } });
  await prisma.role.deleteMany({ where: { id: { in: ids } } });
}

beforeEach(clean);
afterEach(clean);

const auditRows = (entityId: string) => prisma.auditLog.findMany({ where: { entityId } });

async function createRole(permissions: string[] = ['audit.read']) {
  const res = await request(app).post('/api/roles').set(roleAdmin()).send({ name: NAME, description: 'd', permissions });
  expect(res.status).toBe(201);
  return res.body as { id: string };
}

describe('permission gate', () => {
  it('403 without role.manage on every roles route', async () => {
    const h = { Authorization: `Bearer ${token(['user.manage'])}` };
    const calls = [
      request(app).get('/api/roles').set(h),
      request(app).get('/api/roles/permissions').set(h),
      request(app).post('/api/roles').set(h).send({}),
      request(app).patch('/api/roles/x').set(h).send({}),
      request(app).delete('/api/roles/x').set(h),
    ];
    for (const res of await Promise.all(calls)) expect(res.status).toBe(403);
  });
});

describe('reads', () => {
  it('lists roles with permissions and userCount', async () => {
    const { id } = await createRole();
    const res = await request(app).get('/api/roles').set(roleAdmin());
    expect(res.status).toBe(200);
    const mine = res.body.find((r: { id: string }) => r.id === id);
    expect(mine).toEqual({ id, name: NAME, description: 'd', isSystem: false, permissions: ['audit.read'], userCount: 0 });
    const sa = res.body.find((r: { name: string }) => r.name === 'SUPER_ADMIN');
    expect(sa.isSystem).toBe(true);
  });

  it('groups permissions by module', async () => {
    const res = await request(app).get('/api/roles/permissions').set(roleAdmin());
    expect(res.status).toBe(200);
    const core = res.body.find((g: { module: string }) => g.module === 'core');
    expect(core.permissions).toContainEqual({ key: 'user.manage', label: 'Manage users' });
  });
});

describe('create and update', () => {
  it('creates a role and audits it once', async () => {
    const { id } = await createRole();
    const rows = await auditRows(id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ entity: 'ROLE', action: 'CREATE', changedBy: 'actor' });
  });

  it('409 on a duplicate name, 400 on an unknown permission at create', async () => {
    await createRole();
    const dup = await request(app).post('/api/roles').set(roleAdmin()).send({ name: NAME, permissions: [] });
    expect(dup.status).toBe(409);
    const bad = await request(app).post('/api/roles').set(roleAdmin()).send({ name: NAME_2, permissions: ['nope.nope'] });
    expect(bad.status).toBe(400);
  });

  it('PATCH with an unknown permission key -> 400 and nothing changes', async () => {
    const { id } = await createRole();
    const res = await request(app).patch(`/api/roles/${id}`).set(roleAdmin()).send({ permissions: ['nope.nope'] });
    expect(res.status).toBe(400);
    expect(await prisma.rolePermission.count({ where: { roleId: id } })).toBe(1);
  });

  it('PATCH changes only the given fields and audits once more', async () => {
    const { id } = await createRole();
    const res = await request(app)
      .patch(`/api/roles/${id}`)
      .set(roleAdmin())
      .send({ name: NAME_2, permissions: ['audit.read', 'user.manage'] });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: NAME_2, permissions: ['audit.read', 'user.manage'] });
    const rows = (await auditRows(id)).filter((r) => r.action === 'UPDATE');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.before).toEqual({ name: NAME, permissions: ['audit.read'] });
  });

  it("editing SUPER_ADMIN's permissions -> 409", async () => {
    const sa = await prisma.role.findUniqueOrThrow({ where: { name: 'SUPER_ADMIN' } });
    const res = await request(app).patch(`/api/roles/${sa.id}`).set(roleAdmin()).send({ permissions: ['audit.read'] });
    expect(res.status).toBe(409);
  });
});

describe('DELETE /api/roles/:id', () => {
  it('409 for a system role', async () => {
    const sa = await prisma.role.findUniqueOrThrow({ where: { name: 'SUPER_ADMIN' } });
    expect((await request(app).delete(`/api/roles/${sa.id}`).set(roleAdmin())).status).toBe(409);
    expect(await prisma.role.count({ where: { name: 'SUPER_ADMIN' } })).toBe(1);
  });

  it('409 when a user holds it; 204 once nobody does, with one audit row', async () => {
    const { id } = await createRole();
    const user = await prisma.user.create({
      data: {
        email: `${PREFIX}-${Date.now()}@example.com`,
        passwordHash: await hashPassword('correct-horse-9'),
        roles: { create: [{ roleId: id }] },
      },
    });
    expect((await request(app).delete(`/api/roles/${id}`).set(roleAdmin())).status).toBe(409);
    await prisma.user.delete({ where: { id: user.id } });
    expect((await request(app).delete(`/api/roles/${id}`).set(roleAdmin())).status).toBe(204);
    const rows = (await auditRows(id)).filter((r) => r.action === 'DELETE');
    expect(rows).toHaveLength(1);
  });

  it('404 for an unknown role', async () => {
    expect((await request(app).delete('/api/roles/nope').set(roleAdmin())).status).toBe(404);
  });
});

describe('permission escalation', () => {
  const as = (permissions: string[]) => ({ Authorization: `Bearer ${token(permissions)}` });

  it('403 when creating a role with a permission the caller lacks', async () => {
    const res = await request(app).post('/api/roles').set(as(['role.manage'])).send({ name: NAME, permissions: ['user.manage'] });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Cannot add permissions you do not hold');
  });

  it('403 when adding a permission the caller lacks, 200 when the caller holds it', async () => {
    const { id } = await createRole();
    const body = { permissions: ['audit.read', 'user.manage'] };
    expect((await request(app).patch(`/api/roles/${id}`).set(as(['role.manage'])).send(body)).status).toBe(403);
    expect((await request(app).patch(`/api/roles/${id}`).set(as(['role.manage', 'user.manage'])).send(body)).status).toBe(200);
  });

  it('allows removing a permission the caller does not hold', async () => {
    const { id } = await createRole(['audit.read', 'user.manage']);
    const res = await request(app).patch(`/api/roles/${id}`).set(as(['role.manage', 'audit.read'])).send({ permissions: ['audit.read'] });
    expect(res.status).toBe(200);
  });
});
