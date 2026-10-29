import 'dotenv/config';
import { allPermissions } from '@erp/contracts';
import { prisma } from '../src/client.js';
import { syncPermissions } from '../src/seed/sync-permissions.js';
import { seedRoles } from '../src/seed/seed-roles.js';
import { grantNewPermissions } from '../src/seed/grant-new-permissions.js';
import { STARTER_ROLES } from '../src/seed/starter-roles.js';
import { seedDefaultShift } from '../src/seed/default-shift.js';
import { seedAssetCategories } from '../src/seed/asset-categories.js';
import { seedExpenseCategories } from '../src/seed/expense-categories.js';
import { seedLeaveTypes } from '../src/seed/leave-types.js';
import { seedSuperAdmin } from '../src/seed/seed-super-admin.js';

async function main(): Promise<void> {
  const { added, removed } = await syncPermissions(prisma, allPermissions());
  console.log('added:', added, 'removed:', removed);
  await seedRoles(prisma);
  await seedLeaveTypes(prisma);
  await seedDefaultShift(prisma);
  await seedExpenseCategories(prisma);
  await seedAssetCategories(prisma);
  await grantNewPermissions(prisma, added, STARTER_ROLES);
  const created = await seedSuperAdmin(prisma);
  if (created) console.log(`created super admin ${created}`);
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
