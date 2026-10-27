import { afterEach, describe, expect, it } from 'vitest';
import { hashPassword } from '@erp/auth';
import { prisma } from '@erp/db';
import { loadPublicUser } from './auth.service.js';

const email = `zztest8-svc-${Date.now()}@example.com`;

afterEach(async () => {
  await prisma.user.deleteMany({ where: { email } });
  await prisma.role.deleteMany({ where: { name: 'ZZTEST8_SVC' } });
  await prisma.permission.deleteMany({ where: { module: 'zztest8svc' } });
});

describe('loadPublicUser', () => {
  it('returns roles and sorted effective permissions without the hash', async () => {
    await prisma.permission.createMany({
      data: ['zztest8svc.b', 'zztest8svc.a'].map((key) => ({ key, label: key, module: 'zztest8svc' })),
    });
    const role = await prisma.role.create({
      data: { name: 'ZZTEST8_SVC', permissions: { create: [{ permissionKey: 'zztest8svc.b' }, { permissionKey: 'zztest8svc.a' }] } },
    });
    const u = await prisma.user.create({
      data: { email, passwordHash: await hashPassword('whatever-123'), roles: { create: [{ roleId: role.id }] } },
    });
    const pub = await loadPublicUser(prisma, u.id);
    expect(pub.permissions).toEqual(['zztest8svc.a', 'zztest8svc.b']);
    expect(pub.roles).toEqual([{ id: role.id, name: 'ZZTEST8_SVC' }]);
    expect(pub.displayName).toBe(email);
    expect(pub).not.toHaveProperty('passwordHash');
  });

  it('throws 404 for an unknown user', async () => {
    await expect(loadPublicUser(prisma, '00000000-0000-0000-0000-000000000000')).rejects.toMatchObject({ status: 404 });
  });
});
