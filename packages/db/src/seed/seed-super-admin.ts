import { hashPassword } from '@erp/auth';
import type { Db } from '../client.js';

/**
 * The password every developer's seeded admin shares, so a fresh clone can sign in without anyone
 * passing a secret around. It is public (it is in `.env.example`), so the seed refuses it in production.
 */
export const DEV_ADMIN_PASSWORD = 'change-me-now';

// Any SUPER_ADMIN row, active or not, blocks creation: the unique index allows only one, and
// replacing a locked-out owner is the admin:transfer CLI's job, not the seed's.
export async function seedSuperAdmin(
  db: Db,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string | null> {
  const rawEmail = env['SEED_ADMIN_EMAIL'];
  if (!rawEmail) return null;
  const email = rawEmail.trim().toLowerCase();
  const password = env['SEED_ADMIN_PASSWORD'];
  if (!password) throw new Error('SEED_ADMIN_PASSWORD is required when SEED_ADMIN_EMAIL is set');
  if (env['NODE_ENV'] === 'production' && password === DEV_ADMIN_PASSWORD) {
    throw new Error(
      'SEED_ADMIN_PASSWORD is the shared dev password; set a real one before seeding production',
    );
  }

  if (await db.user.findFirst({ where: { accessLevel: 'SUPER_ADMIN' }, select: { id: true } }))
    return null;

  // Forced by default. Dev turns it off so the shared password keeps working after the first sign-in.
  const mustChangePassword = env['SEED_ADMIN_MUST_CHANGE_PASSWORD'] !== 'false';
  await db.user.create({
    data: {
      email,
      passwordHash: await hashPassword(password),
      mustChangePassword,
      accessLevel: 'SUPER_ADMIN',
    },
  });
  return email;
}
