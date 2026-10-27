import { afterEach, describe, expect, it } from 'vitest';
import { prisma } from '../client.js';
import { syncPermissions } from './sync-permissions.js';

const X = { key: 'zztest7.x', label: 'X', module: 'zztest7' };
const Y = { key: 'zztest7.y', label: 'Y', module: 'zztest7' };

afterEach(async () => {
  await prisma.role.deleteMany({ where: { name: 'ZZTEST7_ROLE' } });
  await prisma.permission.deleteMany({ where: { module: 'zztest7' } });
});

describe('syncPermissions', () => {
  it('removes undeclared permissions and cascades their grants', async () => {
    // Other modules' real permissions must not be reported, so keep them declared.
    const existing = (await prisma.permission.findMany()).filter((p) => p.module !== 'zztest7');
    await syncPermissions(prisma, [...existing, X, Y]);
    const role = await prisma.role.create({
      data: {
        name: 'ZZTEST7_ROLE',
        permissions: { create: [{ permissionKey: X.key }, { permissionKey: Y.key }] },
      },
    });

    const result = await syncPermissions(prisma, [...existing, X]);

    expect(result.removed).toEqual([Y.key]);
    expect(result.added).toEqual([]);
    const grants = await prisma.rolePermission.findMany({ where: { roleId: role.id } });
    expect(grants.map((g) => g.permissionKey)).toEqual([X.key]);
  });
});
