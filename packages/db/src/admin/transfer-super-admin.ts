import type { PrismaClient } from '../generated/prisma/client.js';

/**
 * Hands the single SUPER_ADMIN seat to another active user; the previous owner becomes ADMIN.
 * The old owner is demoted first because the one_super_admin index is checked per statement.
 */
export async function transferSuperAdmin(db: PrismaClient, rawEmail: string): Promise<{ from: string | null; to: string }> {
  const email = rawEmail.trim().toLowerCase();
  return db.$transaction(async (tx) => {
    const target = await tx.user.findUnique({ where: { email } });
    if (!target) throw new Error(`No user with email ${email}`);
    if (!target.isActive) throw new Error(`${email} is deactivated`);
    if (target.accessLevel === 'SUPER_ADMIN') throw new Error(`${email} is already the super admin`);

    const current = await tx.user.findFirst({ where: { accessLevel: 'SUPER_ADMIN' } });
    if (current) {
      await tx.user.update({ where: { id: current.id }, data: { accessLevel: 'ADMIN' } });
    }
    // Admins hold everything by level, so a leftover role would only mislead.
    await tx.user.update({ where: { id: target.id }, data: { accessLevel: 'SUPER_ADMIN', roleId: null } });
    // Existing access tokens still carry the old level for up to their lifetime; ending the
    // sessions makes the change effective at the next refresh.
    await tx.refreshToken.updateMany({
      where: { userId: { in: [target.id, ...(current ? [current.id] : [])] }, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await tx.auditLog.create({
      data: {
        entity: 'USER',
        entityId: target.id,
        action: 'UPDATE',
        changedBy: 'cli:admin-transfer',
        before: { accessLevel: target.accessLevel },
        after: { accessLevel: 'SUPER_ADMIN', previousOwner: current?.email ?? null },
      },
    });
    return { from: current?.email ?? null, to: email };
  });
}
