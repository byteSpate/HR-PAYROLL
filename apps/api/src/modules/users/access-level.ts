import { updateUserAccessLevelSchema } from '@erp/contracts/core';
import type { PublicUser } from '@erp/contracts/core';
import { prisma } from '@erp/db';
import { AppError } from '@erp/utils';
import { writeAudit } from '../../audit.js';
import { loadPublicUser } from '../auth/auth.service.js';
import { assertCanActOn, type Caller } from './guards.js';

/**
 * Appoints or removes an admin. Super admin only, and the caller's level is re-read from the
 * database instead of trusted from the token: a token outlives a transfer of ownership by up
 * to its lifetime, and this is the one action that must not.
 */
export async function setAccessLevel(userId: string, input: unknown, caller: Caller): Promise<PublicUser> {
  const { accessLevel } = updateUserAccessLevelSchema.parse(input);
  await prisma.$transaction(async (tx) => {
    const actor = await tx.user.findUnique({ where: { id: caller.sub }, select: { accessLevel: true, isActive: true } });
    if (actor?.accessLevel !== 'SUPER_ADMIN' || !actor.isActive) {
      throw new AppError(403, 'Only the super admin can appoint or remove admins');
    }
    const target = await tx.user.findUnique({ where: { id: userId }, select: { id: true, accessLevel: true } });
    if (!target) throw new AppError(404, 'User not found');
    assertCanActOn({ ...caller, accessLevel: actor.accessLevel }, target);
    if (target.accessLevel === accessLevel) return;

    // Admins hold everything, so a role would be meaningless; clearing keeps a later
    // demotion from silently resurrecting an old role.
    await tx.user.update({
      where: { id: userId },
      data: { accessLevel, ...(accessLevel === 'ADMIN' ? { roleId: null } : {}) },
    });
    // A demoted admin's access token still says ADMIN; ending the sessions makes the demotion
    // bite at the next refresh instead of whenever the user next signs in.
    if (accessLevel === 'STANDARD') {
      await tx.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    await writeAudit(tx, {
      entity: 'USER',
      entityId: userId,
      action: 'UPDATE',
      changedBy: caller.sub,
      before: { accessLevel: target.accessLevel },
      after: { accessLevel },
    });
  });
  return loadPublicUser(prisma, userId);
}
