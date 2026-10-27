import { describe, expect, it } from 'vitest';
import { allPermissions } from '@erp/contracts';
import { prisma } from '../client.js';
import { seedRoles } from './seed-roles.js';
import { STARTER_ROLES } from './starter-roles.js';
import { syncPermissions } from './sync-permissions.js';

const names = STARTER_ROLES.map((r) => r.name);

async function reset() {
  await prisma.user.updateMany({ where: { role: { name: { in: names } } }, data: { roleId: null } });
  await prisma.role.deleteMany({ where: { name: { in: names } } });
}

describe('seedRoles', () => {
  it('creates the starter roles with their grants, and again changes nothing', async () => {
    await syncPermissions(prisma, allPermissions());
    await reset();
    await seedRoles(prisma);
    await seedRoles(prisma);

    const roles = await prisma.role.findMany({ where: { name: { in: names } }, include: { permissions: true } });
    expect(roles.map((r) => r.name).sort()).toEqual([...names].sort());
    const hr = roles.find((r) => r.name === 'HR Admin')!;
    const hrDef = STARTER_ROLES.find((r) => r.name === 'HR Admin')!;
    expect(hr.permissions.map((p) => [p.permissionKey, p.scope]).sort()).toEqual(
      hrDef.grants.map((g) => [g.key, g.scope ? g.scope.toUpperCase() : null]).sort(),
    );
  });

  it('does not touch a starter role an admin has edited', async () => {
    await syncPermissions(prisma, allPermissions());
    await reset();
    await seedRoles(prisma);
    const hr = await prisma.role.findUniqueOrThrow({ where: { name: 'HR Admin' } });
    await prisma.rolePermission.deleteMany({ where: { roleId: hr.id } });

    await seedRoles(prisma);

    expect(await prisma.rolePermission.count({ where: { roleId: hr.id } })).toBe(0);
  });
});
