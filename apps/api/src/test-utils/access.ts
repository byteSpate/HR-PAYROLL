import { hashPassword, signAccessToken, type AccessLevel } from '@erp/auth';
import { prisma } from '@erp/db';
import { env } from '../env.js';

const SUPER_ADMIN_EMAIL = 'zztest-super-admin@example.com';

/**
 * The database allows exactly one SUPER_ADMIN, so tests share this one instead of inserting
 * their own. Never delete it in a cleanup; it is reused across test files.
 */
export async function ensureTestSuperAdmin() {
  const existing = await prisma.user.findFirst({ where: { accessLevel: 'SUPER_ADMIN' } });
  if (existing) return existing;
  return prisma.user.create({
    data: {
      email: SUPER_ADMIN_EMAIL,
      displayName: 'Test super admin',
      passwordHash: await hashPassword('correct-horse-9'),
      accessLevel: 'SUPER_ADMIN',
    },
  });
}

export function bearer(sub: string, accessLevel: AccessLevel, grants: string[] = []): { Authorization: string } {
  return { Authorization: `Bearer ${signAccessToken({ sub, accessLevel, grants }, env.JWT_ACCESS_SECRET, '5m')}` };
}
