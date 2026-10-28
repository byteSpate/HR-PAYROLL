import { hashPassword } from '@erp/auth';
import type { Db } from '../client.js';

// Any SUPER_ADMIN row, active or not, blocks creation: the unique index allows only one, and
// replacing a locked-out owner is the admin:transfer CLI's job, not the seed's.
export async function seedSuperAdmin(db: Db, env: NodeJS.ProcessEnv = process.env): Promise<string | null> {
  const rawEmail = env['SEED_ADMIN_EMAIL'];
  if (!rawEmail) return null;
  const email = rawEmail.trim().toLowerCase();
  const password = env['SEED_ADMIN_PASSWORD'];
  if (!password) throw new Error('SEED_ADMIN_PASSWORD is required when SEED_ADMIN_EMAIL is set');

  if (await db.user.findFirst({ where: { accessLevel: 'SUPER_ADMIN' }, select: { id: true } })) return null;

  await db.user.create({
    data: { email, passwordHash: await hashPassword(password), mustChangePassword: true, accessLevel: 'SUPER_ADMIN' },
  });
  return email;
}
