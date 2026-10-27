import { generateTemporaryPassword, hashPassword } from '@erp/auth';
import type { Db } from '../client.js';

/** Sets a new temporary password for the super admin and returns it; it is shown once and not stored. */
export async function resetSuperAdminPassword(db: Db): Promise<{ email: string; temporaryPassword: string }> {
  const admin = await db.user.findFirst({ where: { accessLevel: 'SUPER_ADMIN' } });
  if (!admin) throw new Error('There is no super admin to reset');
  const temporaryPassword = generateTemporaryPassword();
  await db.user.update({
    where: { id: admin.id },
    data: { passwordHash: await hashPassword(temporaryPassword), mustChangePassword: true },
  });
  // A reset usually follows a suspected compromise, so existing sessions must end.
  await db.refreshToken.updateMany({ where: { userId: admin.id, revokedAt: null }, data: { revokedAt: new Date() } });
  await db.auditLog.create({
    data: { entity: 'USER', entityId: admin.id, action: 'UPDATE', changedBy: 'cli:admin-reset-password', note: 'password reset' },
  });
  return { email: admin.email, temporaryPassword };
}
