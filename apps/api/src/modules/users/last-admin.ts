import type { Tx } from '@erp/db';
import { AppError } from '@erp/utils';

export const SUPER_ADMIN = 'SUPER_ADMIN';

/**
 * Refuses a change that would leave no active super admin. Counts only active holders: a
 * deactivated spare cannot sign in, so it is no safety net.
 */
export async function assertNotLastSuperAdmin(
  tx: Tx,
  change: { userId: string; removesSuperAdmin?: boolean; deactivates?: boolean },
): Promise<void> {
  if (!change.removesSuperAdmin && !change.deactivates) return;
  // Serialises concurrent demotions: two requests each seeing "another admin exists" would
  // otherwise both pass and leave zero.
  await tx.$queryRaw`SELECT id FROM "Role" WHERE name = ${SUPER_ADMIN} FOR UPDATE`;
  const target = await tx.user.findUnique({
    where: { id: change.userId },
    select: { isActive: true, roles: { select: { role: { select: { name: true } } } } },
  });
  // Not an active super admin today, so the change cannot reduce the count.
  if (!target?.isActive || !target.roles.some((r) => r.role.name === SUPER_ADMIN)) return;

  const others = await tx.user.count({
    where: { id: { not: change.userId }, isActive: true, roles: { some: { role: { name: SUPER_ADMIN } } } },
  });
  if (others === 0) throw new AppError(409, 'At least one active super admin is required');
}
