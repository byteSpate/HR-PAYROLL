import { generateTemporaryPassword, hashPassword } from '@erp/auth';
import { writeAudit } from '@erp/audit';
import { prisma } from '@erp/db';
import { AppError } from '@erp/utils';
import {
  assertAddressFree,
  normaliseEmail,
  revokeAllUserTokens,
  sendEmailChangedNotices,
} from '../auth/auth.emailchange.js';
import { sendCredentialsMail } from '../users/users.service.js';
import { loadForAction } from './employee.exit.js';
import type { Viewer } from './employee.access.js';

export interface EmployeeEmailChange {
  email: string;
  previousEmail: string;
  /** True when the invite was reissued because the account had never been used. */
  inviteResent: boolean;
}

/**
 * An administrator changing the sign-in address on somebody else's account.
 *
 * The deliberate opposite of the self-service flow: that one sends a link to the address on file and waits; this
 * one applies at once, for people who cannot act for themselves (the invite went to a mistyped address, so there
 * is no inbox to approve from). The safeguards differ in kind, not strength: it needs `employee.update`, it is
 * audited with both addresses, both addresses are told, and every session is revoked. An account never used has
 * its invite reissued with a fresh temporary password, because the old one went to a stranger's inbox.
 */
export async function changeEmployeeEmail(
  viewer: Viewer,
  employeeId: string,
  rawNewEmail: string,
): Promise<EmployeeEmailChange> {
  const newEmail = normaliseEmail(rawNewEmail);
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);

  const result = await prisma.$transaction(async (tx) => {
    const { employee } = await loadForAction(tx, viewer, employeeId, 'employee.update');
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${employee.userId} FOR UPDATE`;
    const user = await tx.user.findUniqueOrThrow({
      where: { id: employee.userId },
      select: { id: true, email: true, mustChangePassword: true },
    });
    if (normaliseEmail(user.email) === newEmail)
      throw new AppError(400, 'That is already the address on this account');
    await assertAddressFree(newEmail, tx);
    // mustChangePassword is the "never completed a first sign-in" signal: set at creation, cleared when they choose a password.
    const neverUsed = user.mustChangePassword;
    await tx.user.update({
      where: { id: user.id },
      data: { email: newEmail, ...(neverUsed ? { passwordHash } : {}) },
    });
    await revokeAllUserTokens(tx, user.id);
    await writeAudit(tx, {
      entity: 'USER_ACCOUNT',
      entityId: user.id,
      action: 'UPDATE',
      changedBy: viewer.sub,
      before: { email: user.email },
      after: { email: newEmail, inviteResent: neverUsed },
    });
    return { userId: user.id, previousEmail: user.email, neverUsed };
  });

  // After the commit: a mail outage must not undo the change.
  if (result.neverUsed) await sendCredentialsMail(result.userId, newEmail, temporaryPassword);
  await sendEmailChangedNotices(result.userId, result.previousEmail, newEmail);
  return { email: newEmail, previousEmail: result.previousEmail, inviteResent: result.neverUsed };
}
