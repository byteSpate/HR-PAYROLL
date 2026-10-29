/**
 * Changing the address an account signs in with.
 *
 * Kept out of `auth.service.ts` because it is a workflow rather than a
 * request/response pair. Two links, two inboxes: approve from the address
 * already on file, then confirm at the new one. Only then does anything change.
 *
 * ## Why two links and not one
 *
 * An email address here is the sign-in identity *and* the password-reset
 * target, so whoever controls the address controls the account. One link
 * cannot answer both questions — "did the owner ask for this?" (only the old
 * inbox can) and "is the new address real?" (only the new inbox can).
 */

import { generateOpaqueToken, hashToken } from '@erp/auth';
import { type Tx, prisma } from '@erp/db';
import { AppError } from '@erp/utils';
import { renderEmail, sendMail, serialFor } from '@erp/mail';
import { env } from '../../env.js';

const REQUEST_TTL_MS = 60 * 60 * 1000;

/** Stops a request being used to post repeatedly into somebody's inbox. */
const COOLDOWN_MS = 60_000;

/** Addresses are compared and stored lower-cased. */
export const normaliseEmail = (email: string): string => email.trim().toLowerCase();

/** The shape the client needs to show "a change is pending". */
export interface PendingEmailChange {
  newEmail: string;
  /** Whether the owner has approved it from their current address yet. */
  approved: boolean;
  expiresAt: string;
}

function live(now = Date.now()) {
  return {
    completedAt: null,
    cancelledAt: null,
    expiresAt: { gt: new Date(now) },
  };
}

function assertUsable(
  request: { completedAt: Date | null; cancelledAt: Date | null; expiresAt: Date } | null,
  what: string,
): void {
  if (!request) throw new AppError(400, `That ${what} link is not valid`);
  if (request.completedAt) throw new AppError(400, 'This email change has already been completed');
  if (request.cancelledAt) throw new AppError(400, 'This email change was cancelled');
  if (request.expiresAt.getTime() < Date.now()) {
    throw new AppError(400, `That ${what} link has expired. Start the change again.`);
  }
}

/** Refuses an address already in use, including on deactivated accounts. */
export async function assertAddressFree(
  email: string,
  db: Tx | typeof prisma = prisma,
): Promise<void> {
  const taken = await db.user.findUnique({
    where: { email: normaliseEmail(email) },
    select: { id: true },
  });
  if (taken) {
    throw new AppError(409, 'That email address is already in use on another account');
  }
}

/** Reads the user row under a lock inside the caller's transaction. */
async function lockUser(tx: Tx, userId: string) {
  await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true },
  });
  if (!user) throw new AppError(404, 'Account not found');
  return user;
}

/** Takes the request's row lock and reads it again under it, so two clicks on one link cannot both win. */
async function lockRequest(
  tx: Tx,
  where: { approveTokenHash: string } | { confirmTokenHash: string },
) {
  const found = await tx.emailChangeRequest.findUnique({ where, select: { id: true } });
  if (!found) return null;
  await tx.$queryRaw`SELECT id FROM "EmailChangeRequest" WHERE id = ${found.id} FOR UPDATE`;
  return tx.emailChangeRequest.findUnique({ where: { id: found.id } });
}

/** Revokes every refresh token for a user, signed out everywhere. */
export async function revokeAllUserTokens(tx: Tx, userId: string): Promise<void> {
  await tx.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

const approvalLink = (token: string) => `${env.CLIENT_ORIGIN}/email-change/approve?token=${token}`;
const confirmLink = (token: string) => `${env.CLIENT_ORIGIN}/email-change/confirm?token=${token}`;
const signInLink = `${env.CLIENT_ORIGIN}/login`;

/**
 * Step 1. Starts a change and emails the address **currently on file**.
 *
 * Nothing goes to the new address yet: mailing it before the owner has
 * approved would let anyone with a session use this endpoint to send mail to
 * an arbitrary address.
 */
export async function requestEmailChange(
  userId: string,
  rawNewEmail: string,
): Promise<PendingEmailChange> {
  const newEmail = normaliseEmail(rawNewEmail);

  const { user, created, rawApprove, expiresAt } = await prisma.$transaction(async (tx) => {
    const user = await lockUser(tx, userId);
    if (normaliseEmail(user.email) === newEmail) {
      throw new AppError(400, 'That is already the address on this account');
    }

    await assertAddressFree(newEmail, tx);

    const recent = await tx.emailChangeRequest.findFirst({
      where: { userId, createdAt: { gt: new Date(Date.now() - COOLDOWN_MS) } },
      select: { id: true },
    });
    if (recent) {
      throw new AppError(
        429,
        'A change was just requested. Check your inbox, or try again shortly.',
      );
    }

    const rawApprove = generateOpaqueToken();
    const expiresAt = new Date(Date.now() + REQUEST_TTL_MS);

    await tx.emailChangeRequest.updateMany({
      where: { userId, ...live() },
      data: { cancelledAt: new Date() },
    });
    const created = await tx.emailChangeRequest.create({
      data: { userId, newEmail, approveTokenHash: hashToken(rawApprove), expiresAt },
    });
    return { user, created, rawApprove, expiresAt };
  });

  // After the commit: a mail outage must not undo the request, and a link must not exist before its row does.
  await sendMail({
    to: user.email,
    kind: 'EMAIL_CHANGE_WARNING',
    subject: `Approve the email change on your ${env.COMPANY_NAME} account`,
    html: await renderEmail({
      serial: serialFor('EMAIL_CHANGE_WARNING', userId),
      subject: `Approve the email change on your account`,
      stamp: { label: 'Action required', tone: 'action' },
      intro: `Someone asked to change the email address on your account to ${newEmail}. Nothing has changed yet.`,
      action: {
        label: 'Yes, this was me',
        href: approvalLink(rawApprove),
        note: 'If it was not you, do not click. Change your password now and tell your administrator — whoever asked for this can currently sign in as you.',
      },
      footer: `You are receiving this because someone asked to move this ${env.COMPANY_NAME} account to a different address.`,
    }),
  });

  return { newEmail: created.newEmail, approved: false, expiresAt: expiresAt.toISOString() };
}

/**
 * Step 2. The owner clicked the link in their current inbox.
 *
 * Only now is a confirm token minted, and only now does the new address hear
 * anything at all.
 */
export async function approveEmailChange(rawToken: string): Promise<{ newEmail: string }> {
  const rawConfirm = generateOpaqueToken();
  const request = await prisma.$transaction(async (tx) => {
    const locked = await lockRequest(tx, { approveTokenHash: hashToken(rawToken) });
    assertUsable(locked, 'approval');
    // One click, one confirm link: a second would replace the first and leave the owner unsure which is live.
    if (locked!.approvedAt) throw new AppError(409, 'This email change has already been approved');
    return tx.emailChangeRequest.update({
      where: { id: locked!.id },
      data: { approvedAt: new Date(), confirmTokenHash: hashToken(rawConfirm) },
    });
  });

  await sendMail({
    to: request.newEmail,
    kind: 'EMAIL_CHANGE_CONFIRM',
    subject: `Confirm this address for your ${env.COMPANY_NAME} account`,
    html: await renderEmail({
      serial: serialFor('EMAIL_CHANGE_CONFIRM', request.userId),
      subject: `Confirm this address for your account`,
      stamp: { label: 'Action required', tone: 'action' },
      intro: `This address was given as the new sign-in address for a ${env.COMPANY_NAME} account. One more click and it takes effect.`,
      action: {
        label: 'Confirm this address',
        href: confirmLink(rawConfirm),
        note: 'If you were not expecting this, ignore this email. Nothing will change.',
      },
      footer: `You are receiving this because this address was given as the new sign-in address for a ${env.COMPANY_NAME} account.`,
    }),
  });

  return { newEmail: request.newEmail };
}

/** Step 2, refused. "This wasn't me." Sessions are revoked. */
export async function cancelEmailChange(rawToken: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const request = await lockRequest(tx, { approveTokenHash: hashToken(rawToken) });
    assertUsable(request, 'approval');
    await tx.emailChangeRequest.update({
      where: { id: request!.id },
      data: { cancelledAt: new Date() },
    });
    await revokeAllUserTokens(tx, request!.userId);
  });
}

/**
 * Step 3. The new inbox proved it exists. Apply the change.
 *
 * The collision check runs again here: an address free an hour ago may belong
 * to somebody by now.
 */
export async function confirmEmailChange(rawToken: string): Promise<{ email: string }> {
  const { req, previousEmail } = await prisma.$transaction(async (tx) => {
    const request = await lockRequest(tx, { confirmTokenHash: hashToken(rawToken) });
    assertUsable(request, 'confirmation');
    if (!request!.approvedAt) {
      throw new AppError(
        400,
        'This email change has not been approved from the current address yet',
      );
    }
    const user = await lockUser(tx, request!.userId);
    await assertAddressFree(request!.newEmail, tx);
    await tx.user.update({ where: { id: user.id }, data: { email: request!.newEmail } });
    await tx.emailChangeRequest.update({
      where: { id: request!.id },
      data: { completedAt: new Date() },
    });
    await revokeAllUserTokens(tx, user.id);
    return { req: request!, previousEmail: user.email };
  });

  // Both addresses. Not awaited inside the transaction: a mail outage must
  // not undo a committed change.
  await sendEmailChangedNotices(req.userId, previousEmail, req.newEmail);

  return { email: req.newEmail };
}

/** Tells both addresses the sign-in address changed: the old inbox is the only place a wrong change can still be spotted. */
export async function sendEmailChangedNotices(userId: string, previousEmail: string, newEmail: string): Promise<void> {
  const notice = async (to: string) =>
    sendMail({
      to,
      kind: 'EMAIL_CHANGED',
      subject: `Your ${env.COMPANY_NAME} sign-in address has changed`,
      html: await renderEmail({
        serial: serialFor('EMAIL_CHANGED', userId),
        subject: `Your sign-in address has changed`,
        stamp: { label: 'Security notice', tone: 'notice' },
        intro: `The sign-in address on this account changed from ${previousEmail} to ${newEmail}. You have been signed out everywhere and will need to sign in again with the new address.`,
        action: {
          label: 'Sign in',
          href: signInLink,
          note: 'If this was not you, tell your administrator immediately.',
        },
        footer: `You are receiving this because the sign-in address on a ${env.COMPANY_NAME} account was changed.`,
      }),
    });
  await Promise.all([notice(newEmail), notice(previousEmail)]);
}

/** What the profile screen shows while a change is in flight. */
export async function getPendingEmailChange(userId: string): Promise<PendingEmailChange | null> {
  const request = await prisma.emailChangeRequest.findFirst({
    where: { userId, ...live() },
    orderBy: [{ createdAt: 'desc' }],
  });
  if (!request) return null;
  return {
    newEmail: request.newEmail,
    approved: request.approvedAt !== null,
    expiresAt: request.expiresAt.toISOString(),
  };
}
