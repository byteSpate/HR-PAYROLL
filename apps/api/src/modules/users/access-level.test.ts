import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { can, hashPassword, verifyAccessToken } from '@erp/auth';
import { prisma } from '@erp/db';
import { createApp } from '../../app.js';
import { env } from '../../env.js';
import { bearer, ensureTestSuperAdmin } from '../../test-utils/access.js';

const app = createApp();
const PREFIX = 'zztest0al';
const ROLE = 'ZZTEST0AL_ROLE';

let seq = 0;
async function makeUser(accessLevel: 'ADMIN' | 'STANDARD' = 'STANDARD', withRole = true) {
  const role = await prisma.role.findUnique({ where: { name: ROLE } });
  return prisma.user.create({
    data: {
      email: `${PREFIX}-${Date.now()}-${seq++}@example.com`,
      passwordHash: await hashPassword('correct-horse-9'),
      accessLevel,
      roleId: withRole && accessLevel === 'STANDARD' ? role!.id : null,
    },
  });
}

async function clean() {
  const users = await prisma.user.findMany({ where: { email: { startsWith: PREFIX } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  await prisma.auditLog.deleteMany({ where: { entityId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.role.deleteMany({ where: { name: ROLE } });
}

beforeEach(async () => {
  await clean();
  await prisma.role.create({ data: { name: ROLE } });
});
afterEach(clean);

const patch = (id: string, header: { Authorization: string }, accessLevel: string) =>
  request(app).patch(`/api/users/${id}/access-level`).set(header).send({ accessLevel });

describe('PATCH /api/users/:id/access-level', () => {
  it('the super admin promotes a user to ADMIN: 200, role cleared, audited, and they then pass can(anything:all)', async () => {
    const sa = await ensureTestSuperAdmin();
    const u = await makeUser('STANDARD');
    const res = await patch(u.id, bearer(sa.id, 'SUPER_ADMIN'), 'ADMIN');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ accessLevel: 'ADMIN', role: null, grants: [] });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).roleId).toBeNull();
    const audit = await prisma.auditLog.findMany({ where: { entityId: u.id } });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ changedBy: sa.id, before: { accessLevel: 'STANDARD' }, after: { accessLevel: 'ADMIN' } });

    const login = await request(app).post('/api/auth/login').send({ email: u.email, password: 'correct-horse-9' });
    const payload = verifyAccessToken(login.body.accessToken, env.JWT_ACCESS_SECRET);
    expect(can(payload, 'anything:all')).toBe(true);
    expect(payload.grants).toEqual([]);
  });

  it('demoting to STANDARD: 200, the admin sessions end, and no old role comes back', async () => {
    const sa = await ensureTestSuperAdmin();
    const admin = await makeUser('ADMIN');
    await request(app).post('/api/auth/login').send({ email: admin.email, password: 'correct-horse-9' });
    const res = await patch(admin.id, bearer(sa.id, 'SUPER_ADMIN'), 'STANDARD');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ accessLevel: 'STANDARD', role: null });
    expect(await prisma.refreshToken.count({ where: { userId: admin.id, revokedAt: null } })).toBe(0);
  });

  it('an admin calling it gets 403 and nothing changes', async () => {
    const u = await makeUser('STANDARD');
    const res = await patch(u.id, bearer('adm', 'ADMIN'), 'ADMIN');
    expect(res.status).toBe(403);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).accessLevel).toBe('STANDARD');
  });

  it('a forged SUPER_ADMIN token for a user who is not the super admin gets 403 (level re-read from the database)', async () => {
    const u = await makeUser('STANDARD');
    const target = await makeUser('STANDARD');
    expect((await patch(target.id, bearer(u.id, 'SUPER_ADMIN'), 'ADMIN')).status).toBe(403);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).accessLevel).toBe('STANDARD');
  });

  it('a stale SUPER_ADMIN token after the seat moved gets 403', async () => {
    const sa = await ensureTestSuperAdmin();
    const target = await makeUser('STANDARD');
    await prisma.user.update({ where: { id: sa.id }, data: { accessLevel: 'ADMIN' } });
    try {
      expect((await patch(target.id, bearer(sa.id, 'SUPER_ADMIN'), 'ADMIN')).status).toBe(403);
    } finally {
      await prisma.user.update({ where: { id: sa.id }, data: { accessLevel: 'SUPER_ADMIN' } });
    }
  });

  it('SUPER_ADMIN is not an assignable level: 400', async () => {
    const sa = await ensureTestSuperAdmin();
    const u = await makeUser('STANDARD');
    expect((await patch(u.id, bearer(sa.id, 'SUPER_ADMIN'), 'SUPER_ADMIN')).status).toBe(400);
  });

  it('404 for an unknown user; the super admin cannot be targeted, even by themselves', async () => {
    const sa = await ensureTestSuperAdmin();
    expect((await patch('nope', bearer(sa.id, 'SUPER_ADMIN'), 'ADMIN')).status).toBe(404);
    expect((await patch(sa.id, bearer(sa.id, 'SUPER_ADMIN'), 'STANDARD')).status).toBe(403);
  });
});
