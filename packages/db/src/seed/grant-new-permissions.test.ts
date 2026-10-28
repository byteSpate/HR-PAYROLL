import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../client.js';
import { fromDbScope } from '../scope.js';
import { grantNewPermissions } from './grant-new-permissions.js';
import type { StarterRoleDef } from './starter-roles.js';
import { syncPermissions } from './sync-permissions.js';

const ROLE = 'zztest-grant-role';
const KEYS = ['zztestgrant.x', 'zztestgrant.y'];
const roles: StarterRoleDef[] = [
  {
    name: ROLE,
    description: 'test',
    grants: [
      { key: 'zztestgrant.x', scope: null },
      { key: 'zztestgrant.y', scope: 'all' },
    ],
  },
];

async function grantsOf(name: string) {
  const role = await prisma.role.findUniqueOrThrow({ where: { name }, include: { permissions: true } });
  return role.permissions.map((p) => [p.permissionKey, p.scope]).sort();
}

async function cleanup() {
  await prisma.role.deleteMany({ where: { name: ROLE } });
  await prisma.permission.deleteMany({ where: { key: { in: KEYS } } });
}

beforeEach(cleanup);
afterEach(cleanup);

describe('grantNewPermissions', () => {
  it('grants a newly declared key to the starter roles that list it, at the listed scope', async () => {
    await prisma.role.create({ data: { name: ROLE } });
    await prisma.permission.create({ data: { key: 'zztestgrant.y', label: 'y', module: 'zz', scopes: ['ALL'] } });

    await grantNewPermissions(prisma, ['zztestgrant.y'], roles);

    expect(await grantsOf(ROLE)).toEqual([['zztestgrant.y', 'ALL']]);
  });

  it('leaves an older key alone when an admin removed it from the role', async () => {
    await prisma.role.create({ data: { name: ROLE } });
    await prisma.permission.createMany({
      data: [
        { key: 'zztestgrant.x', label: 'x', module: 'zz' },
        { key: 'zztestgrant.y', label: 'y', module: 'zz', scopes: ['ALL'] },
      ],
    });

    // Only y is new in this sync; x existed before and the admin had removed it.
    await grantNewPermissions(prisma, ['zztestgrant.y'], roles);

    expect(await grantsOf(ROLE)).toEqual([['zztestgrant.y', 'ALL']]);
  });

  it('skips roles that do not exist and keys no role lists', async () => {
    await prisma.permission.create({ data: { key: 'zztestgrant.x', label: 'x', module: 'zz' } });

    await expect(grantNewPermissions(prisma, ['zztestgrant.x', 'zztestgrant.none'], roles)).resolves.toBeUndefined();
  });

  it('works with syncPermissions output', async () => {
    await prisma.role.create({ data: { name: ROLE } });
    const existing = (await prisma.permission.findMany()).map((p) => ({ key: p.key, label: p.label, module: p.module, scopes: p.scopes.map(fromDbScope) }));
    const { added } = await syncPermissions(prisma, [...existing, { key: 'zztestgrant.x', label: 'x', module: 'zz' }]);

    await grantNewPermissions(prisma, added, roles);

    expect(await grantsOf(ROLE)).toEqual([['zztestgrant.x', null]]);
  });
});
