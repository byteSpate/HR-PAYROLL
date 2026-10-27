import 'dotenv/config';
import { prisma } from '../src/client.js';
import { transferSuperAdmin } from '../src/admin/transfer-super-admin.js';

const email = process.argv[2];
if (!email) {
  console.error('Usage: pnpm admin:transfer <email>');
  process.exit(1);
}

try {
  const { from, to } = await transferSuperAdmin(prisma, email);
  console.log(`super admin is now ${to}${from ? ` (${from} is now an admin)` : ''}`);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
