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

let actorSeq = 0;

/**
 * A real account plus a token for it. Mutating routes re-read the caller from the database, so
 * a made-up `sub` no longer works. `grants` are 'key' or 'key:scope' and the permission rows must
 * already exist. Remove with cleanActors(prefix) before deleting the permissions or roles.
 */
export async function makeActor(prefix: string, accessLevel: AccessLevel, grants: string[] = []) {
  const n = actorSeq++;
  let roleId: string | null = null;
  if (accessLevel === 'STANDARD' && grants.length > 0) {
    const role = await prisma.role.create({
      data: {
        name: `${prefix.toUpperCase()}_ACTOR_${Date.now()}_${n}`,
        permissions: {
          create: grants.map((g) => {
            const [permissionKey, scope] = g.split(':') as [string, string | undefined];
            return { permissionKey, scope: scope ? (scope.toUpperCase() as 'ALL') : null };
          }),
        },
      },
    });
    roleId = role.id;
  }
  const user = await prisma.user.create({
    data: {
      email: `${prefix}-actor-${Date.now()}-${n}@example.com`,
      passwordHash: await hashPassword('correct-horse-9'),
      accessLevel,
      roleId,
    },
  });
  // The token deliberately carries the same claims: tests that need a stale token build their own.
  return { user, header: bearer(user.id, accessLevel, accessLevel === 'STANDARD' ? grants : []) };
}

export async function cleanActors(prefix: string) {
  await prisma.user.deleteMany({ where: { email: { startsWith: `${prefix}-actor-` } } });
  await prisma.role.deleteMany({ where: { name: { startsWith: `${prefix.toUpperCase()}_ACTOR_` } } });
}
