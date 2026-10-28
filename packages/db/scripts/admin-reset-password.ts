import 'dotenv/config';
import { prisma } from '../src/client.js';
import { resetSuperAdminPassword } from '../src/admin/reset-super-admin-password.js';

try {
  const { email, temporaryPassword } = await resetSuperAdminPassword(prisma);
  console.log(`temporary password for ${email} (shown once, change required at next login):\n${temporaryPassword}`);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
