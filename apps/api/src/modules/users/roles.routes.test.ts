import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hashPassword } from '@erp/auth';
import { prisma } from '@erp/db';
import { createApp } from '../../app.js';
import { bearer } from '../../test-utils/access.js';

const app = createApp();
const PREFIX = 'zztest9r';
const NAME = `${PREFIX.toUpperCase()}_ROLE`;
const NAME_2 = `${PREFIX.toUpperCase()}_RENAMED`;
const SCOPED = `${PREFIX}.read`;
const ONOFF = `${PREFIX}.flag`;

// A role editor may only add grants it holds itself, so the default caller holds them all.
const roleAdmin = () => bearer('actor', 'STANDARD', ['role.manage', 'audit.read', 'user.manage', `${SCOPED}:all`, ONOFF]);
const as = (...grants: string[]) => bearer('actor', 'STANDARD', ['role.manage', ...grants]);

async function clean() {
  const roles = await prisma.role.findMany({ where: { name: { startsWith: PREFIX.toUpperCase() } }, select: { id: true } });
  const ids = roles.map((r) => r.id);
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
  await prisma.auditLog.deleteMany({ where: { entity: 'ROLE', entityId: { in: ids } } });
  await prisma.role.deleteMany({ where: { id: { in: ids } } });
  await prisma.permission.deleteMany({ where: { module: PREFIX } });
}

beforeEach(async () => {
  await clean();
  await prisma.permission.create({
    data: { key: SCOPED, label: 'Read', module: PREFIX, scopes: ['OWN', 'TEAM', 'DEPARTMENT', 'ALL'] },
  });
  await prisma.permission.create({ data: { key: ONOFF, label: 'Flag', module: PREFIX } });
});
afterEach(clean);

const auditRows = (entityId: string) => prisma.auditLog.findMany({ where: { entityId } });
const g = (permissionKey: string, scope: string | null = null) => ({ permissionKey, scope });

async function createRole(permissions = [g('audit.read')]) {
  const res = await request(app).post('/api/roles').set(roleAdmin()).send({ name: NAME, description: 'd', permissions });
  expect(res.status).toBe(201);
  return res.body as { id: string };
}

describe('permission gate', () => {
  it('403 without role.manage on every roles route', async () => {
    const h = bearer('actor', 'STANDARD', ['user.manage']);
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
  it('lists roles with grants and userCount, with no isSystem flag', async () => {
    const { id } = await createRole();
    const res = await request(app).get('/api/roles').set(roleAdmin());
    expect(res.status).toBe(200);
    const mine = res.body.find((r: { id: string }) => r.id === id);
    expect(mine).toEqual({ id, name: NAME, description: 'd', permissions: [g('audit.read')], userCount: 0 });
    expect(res.body.find((r: { name: string }) => r.name === 'SUPER_ADMIN')).toBeUndefined();
  });

  it('groups permissions by module and includes declared scopes', async () => {
    const res = await request(app).get('/api/roles/permissions').set(roleAdmin());
    expect(res.status).toBe(200);
    const core = res.body.find((m: { module: string }) => m.module === 'core');
    expect(core.permissions).toContainEqual({ key: 'user.manage', label: 'Manage users', scopes: [] });
    const mine = res.body.find((m: { module: string }) => m.module === PREFIX);
    expect(mine.permissions).toContainEqual({ key: SCOPED, label: 'Read', scopes: ['own', 'team', 'department', 'all'] });
  });
});

describe('create and update', () => {
  it('creates a role with scoped and on/off grants and audits it once', async () => {
    const { id } = await createRole([g(SCOPED, 'department'), g(ONOFF)]);
    const stored = await prisma.rolePermission.findMany({ where: { roleId: id }, orderBy: { permissionKey: 'asc' } });
    expect(stored.map((r) => [r.permissionKey, r.scope])).toEqual([
      [ONOFF, null],
      [SCOPED, 'DEPARTMENT'],
    ]);
    const rows = await auditRows(id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ entity: 'ROLE', action: 'CREATE', changedBy: 'actor' });
    expect(rows[0]!.after).toMatchObject({ permissions: [ONOFF, `${SCOPED}:department`] });
  });

  it('409 on a duplicate name, 400 on an unknown permission at create', async () => {
    await createRole();
    expect((await request(app).post('/api/roles').set(roleAdmin()).send({ name: NAME, permissions: [] })).status).toBe(409);
    const bad = await request(app).post('/api/roles').set(roleAdmin()).send({ name: NAME_2, permissions: [g('nope.nope')] });
    expect(bad.status).toBe(400);
  });

  it('400 for a scope the permission does not declare, a scope on an on/off permission, or no scope on a scoped one', async () => {
    const send = (permissions: unknown[]) => request(app).post('/api/roles').set(roleAdmin()).send({ name: NAME, permissions });
    // 'department' is declared by SCOPED, so narrow it first to prove the check reads the stored scopes.
    await prisma.permission.update({ where: { key: SCOPED }, data: { scopes: ['OWN', 'ALL'] } });
    expect((await send([g(SCOPED, 'department')])).status).toBe(400);
    expect((await send([g(ONOFF, 'all')])).status).toBe(400);
    expect((await send([g(SCOPED, null)])).status).toBe(400);
    expect((await send([g('audit.read', 'own')])).status).toBe(400);
    expect((await send([g(SCOPED, 'galaxy')])).status).toBe(400);
    expect((await send([g(ONOFF), g(ONOFF)])).status).toBe(400);
    expect(await prisma.role.count({ where: { name: NAME } })).toBe(0);
  });

  it('PATCH with an invalid grant -> 400 and nothing changes', async () => {
    const { id } = await createRole();
    const res = await request(app).patch(`/api/roles/${id}`).set(roleAdmin()).send({ permissions: [g(ONOFF, 'all')] });
    expect(res.status).toBe(400);
    expect(await prisma.rolePermission.count({ where: { roleId: id } })).toBe(1);
  });

  it('PATCH changes only the given fields and audits once more', async () => {
    const { id } = await createRole();
    const res = await request(app)
      .patch(`/api/roles/${id}`)
      .set(roleAdmin())
      .send({ name: NAME_2, permissions: [g('audit.read'), g('user.manage')] });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: NAME_2, permissions: [g('audit.read'), g('user.manage')] });
    const rows = (await auditRows(id)).filter((r) => r.action === 'UPDATE');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.before).toEqual({ name: NAME, permissions: ['audit.read'] });
  });

  it('changing only a scope counts as a change', async () => {
    const { id } = await createRole([g(SCOPED, 'own')]);
    const res = await request(app).patch(`/api/roles/${id}`).set(roleAdmin()).send({ permissions: [g(SCOPED, 'all')] });
    expect(res.status).toBe(200);
    expect(res.body.permissions).toEqual([g(SCOPED, 'all')]);
  });
});

describe('DELETE /api/roles/:id', () => {
  it('409 when a user holds it; 204 once nobody does, with one audit row', async () => {
    const { id } = await createRole();
    const user = await prisma.user.create({
      data: { email: `${PREFIX}-${Date.now()}@example.com`, passwordHash: await hashPassword('correct-horse-9'), roleId: id },
    });
    expect((await request(app).delete(`/api/roles/${id}`).set(roleAdmin())).status).toBe(409);
    await prisma.user.delete({ where: { id: user.id } });
    expect((await request(app).delete(`/api/roles/${id}`).set(roleAdmin())).status).toBe(204);
    expect((await auditRows(id)).filter((r) => r.action === 'DELETE')).toHaveLength(1);
  });

  it('404 for an unknown role', async () => {
    expect((await request(app).delete('/api/roles/nope').set(roleAdmin())).status).toBe(404);
  });
});

describe('scope-aware escalation', () => {
  const MSG = 'Cannot grant permissions you do not hold';

  it('403 creating a role with a permission the caller lacks, or a wider scope than they hold', async () => {
    const missing = await request(app).post('/api/roles').set(as()).send({ name: NAME, permissions: [g('user.manage')] });
    expect(missing.status).toBe(403);
    expect(missing.body.error).toBe(MSG);
    const wider = await request(app)
      .post('/api/roles')
      .set(as(`${SCOPED}:department`))
      .send({ name: NAME, permissions: [g(SCOPED, 'all')] });
    expect(wider.status).toBe(403);
  });

  it('200 for an equal or narrower scope than the caller holds', async () => {
    const caller = as(`${SCOPED}:department`);
    const equal = await request(app).post('/api/roles').set(caller).send({ name: NAME, permissions: [g(SCOPED, 'department')] });
    expect(equal.status).toBe(201);
    const narrower = await request(app).patch(`/api/roles/${equal.body.id}`).set(caller).send({ permissions: [g(SCOPED, 'team')] });
    expect(narrower.status).toBe(200);
  });

  it('widening an existing grant needs the wider scope; removing or keeping grants the caller lacks is allowed', async () => {
    const { id } = await createRole([g('audit.read'), g(SCOPED, 'own')]);
    const widen = await request(app).patch(`/api/roles/${id}`).set(as(`${SCOPED}:team`)).send({ permissions: [g(SCOPED, 'all')] });
    expect(widen.status).toBe(403);
    const dropOne = await request(app).patch(`/api/roles/${id}`).set(as()).send({ permissions: [g(SCOPED, 'own')] });
    expect(dropOne.status).toBe(200);
    const rename = await request(app).patch(`/api/roles/${id}`).set(as()).send({ name: NAME_2 });
    expect(rename.status).toBe(200);
  });

  it('an ADMIN may grant anything', async () => {
    const res = await request(app)
      .post('/api/roles')
      .set(bearer('adm', 'ADMIN'))
      .send({ name: NAME, permissions: [g(SCOPED, 'all'), g('user.manage')] });
    expect(res.status).toBe(201);
  });
});
