import { afterEach, describe, expect, it } from 'vitest';
import { hashPassword } from '@erp/auth';
import { prisma } from '@erp/db';
import { ensureTestSuperAdmin } from '../../test-utils/access.js';
import { loadPublicUser } from './auth.service.js';
import { registerGrantProvider } from './derived-grants.js';

const unregister: (() => void)[] = [];
const email = `zztest8-svc-${Date.now()}@example.com`;

afterEach(async () => {
  unregister.splice(0).forEach((fn) => fn());
  await prisma.user.deleteMany({ where: { email } });
  await prisma.role.deleteMany({ where: { name: 'ZZTEST8_SVC' } });
  await prisma.permission.deleteMany({ where: { module: 'zztest8svc' } });
});

async function userWithRole() {
  await prisma.permission.createMany({
    data: [
      { key: 'zztest8svc.b', label: 'b', module: 'zztest8svc', scopes: ['OWN', 'ALL'] },
      { key: 'zztest8svc.a', label: 'a', module: 'zztest8svc' },
    ],
  });
  const role = await prisma.role.create({
    data: {
      name: 'ZZTEST8_SVC',
      permissions: { create: [{ permissionKey: 'zztest8svc.b', scope: 'ALL' }, { permissionKey: 'zztest8svc.a' }] },
    },
  });
  const user = await prisma.user.create({
    data: { email, passwordHash: await hashPassword('whatever-123'), roleId: role.id },
  });
  return { role, user };
}

describe('loadPublicUser', () => {
  it('returns the role and sorted grants without the hash', async () => {
    const { role, user } = await userWithRole();
    const pub = await loadPublicUser(prisma, user.id);
    expect(pub.grants).toEqual(['zztest8svc.a', 'zztest8svc.b:all']);
    expect(pub.role).toEqual({ id: role.id, name: 'ZZTEST8_SVC' });
    expect(pub.accessLevel).toBe('STANDARD');
    expect(pub.displayName).toBe(email);
    expect(pub).not.toHaveProperty('passwordHash');
  });

  it('gives the super admin and admins an empty grant list even if a role is left behind', async () => {
    const { user } = await userWithRole();
    await prisma.user.update({ where: { id: user.id }, data: { accessLevel: 'ADMIN' } });
    expect((await loadPublicUser(prisma, user.id)).grants).toEqual([]);
    const sa = await ensureTestSuperAdmin();
    expect(await loadPublicUser(prisma, sa.id)).toMatchObject({ accessLevel: 'SUPER_ADMIN', grants: [], role: null });
  });

  it('adds derived grants from registered providers for STANDARD users', async () => {
    const { user } = await userWithRole();
    unregister.push(registerGrantProvider(async (_db, userId) => (userId === user.id ? ['zztest8svc.b:team'] : [])));
    const pub = await loadPublicUser(prisma, user.id);
    expect(pub.grants).toEqual(['zztest8svc.a', 'zztest8svc.b:all', 'zztest8svc.b:team']);
  });

  it('does not consult grant providers for admins', async () => {
    const { user } = await userWithRole();
    await prisma.user.update({ where: { id: user.id }, data: { accessLevel: 'ADMIN' } });
    let calls = 0;
    unregister.push(
      registerGrantProvider(async () => {
        calls += 1;
        return ['zztest8svc.b:team'];
      }),
    );
    expect((await loadPublicUser(prisma, user.id)).grants).toEqual([]);
    expect(calls).toBe(0);
  });

  it('returns only role grants when no provider adds anything', async () => {
    const { user } = await userWithRole();
    expect((await loadPublicUser(prisma, user.id)).grants).toEqual(['zztest8svc.a', 'zztest8svc.b:all']);
  });

  it('throws 404 for an unknown user', async () => {
    await expect(loadPublicUser(prisma, '00000000-0000-0000-0000-000000000000')).rejects.toMatchObject({ status: 404 });
  });
});
