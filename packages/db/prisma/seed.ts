import 'dotenv/config';
import { hashPassword } from '@erp/auth';
import { allPermissions } from '@erp/contracts';
import { prisma } from '../src/client.js';
import { syncPermissions } from '../src/seed/sync-permissions.js';
import { SYSTEM_ROLES } from '../src/seed/system-roles.js';

async function seedRoles(): Promise<void> {
  const keys = (await prisma.permission.findMany({ select: { key: true } })).map((p) => p.key);
  for (const def of SYSTEM_ROLES) {
    let role = await prisma.role.findUnique({ where: { name: def.name } });
    const created = !role;
    role ??= await prisma.role.create({
      data: { name: def.name, description: def.description, isSystem: true },
    });
    // Only SUPER_ADMIN is re-granted on every run; other roles get grants once so admin edits survive.
    if (def.permissions === 'ALL' || created) {
      const grant = def.permissions === 'ALL' ? keys : def.permissions;
      await prisma.rolePermission.createMany({
        data: grant.map((permissionKey) => ({ roleId: role.id, permissionKey })),
        skipDuplicates: true,
      });
    }
  }
}

async function seedFirstAdmin(): Promise<void> {
  const email = process.env['SEED_ADMIN_EMAIL'];
  if (!email) return;
  const password = process.env['SEED_ADMIN_PASSWORD'];
  if (!password) throw new Error('SEED_ADMIN_PASSWORD is required when SEED_ADMIN_EMAIL is set');

  const existing = await prisma.user.findFirst({
    where: { isActive: true, roles: { some: { role: { name: 'SUPER_ADMIN' } } } },
  });
  if (existing) return;

  const roles = await prisma.role.findMany({ where: { name: { in: ['SUPER_ADMIN', 'EMPLOYEE'] } } });
  await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(password),
      mustChangePassword: true,
      roles: { create: roles.map((r) => ({ roleId: r.id })) },
    },
  });
  console.log(`created super admin ${email}`);
}

async function main(): Promise<void> {
  const { added, removed } = await syncPermissions(prisma, allPermissions());
  console.log('added:', added, 'removed:', removed);
  await seedRoles();
  await seedFirstAdmin();
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
