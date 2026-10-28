import {
  generateOpaqueToken,
  hashPassword,
  hashToken,
  refreshLifetimeMs,
  signAccessToken,
  verifyPassword,
} from '@erp/auth';
import type { PublicUser } from '@erp/contracts/core';
import { prisma, type Db } from '@erp/db';
import { AppError } from '@erp/utils';
import { env } from '../../env.js';
import type { SessionContext } from './auth.cookies.js';
import { derivedGrants } from './derived-grants.js';
import { grantStrings } from './grant-strings.js';

export interface SessionResult {
  accessToken: string;
  refreshToken: string;
  user: PublicUser;
}

// Verified when the email is unknown so response time does not reveal which accounts exist.
const DUMMY_HASH = hashPassword('dummy-password-for-timing');

const INVALID_CREDENTIALS = 'Invalid email or password';

export async function loadPublicUser(db: Db, userId: string): Promise<PublicUser> {
  const user = await db.user.findUnique({
    where: { id: userId },
    include: { role: { include: { permissions: true } } },
  });
  if (!user) throw new AppError(404, 'User not found');
  // ADMIN and SUPER_ADMIN hold everything by level, so they carry no grant list.
  const holdsEverything = user.accessLevel !== 'STANDARD';
  const grants = holdsEverything
    ? []
    : [...new Set([...grantStrings(user.role?.permissions ?? []), ...(await derivedGrants(db, userId))])].sort();
  return {
    id: user.id,
    email: user.email,
    // Staff names live on Employee (Plan 2); until then an account without one shows its email.
    displayName: user.displayName ?? user.email,
    isActive: user.isActive,
    mustChangePassword: user.mustChangePassword,
    accessLevel: user.accessLevel,
    role: user.role ? { id: user.role.id, name: user.role.name } : null,
    grants,
  };
}

interface Continuation {
  sessionId: string;
  startedAt: Date;
  userAgent: string | null;
}

async function issueRefreshToken(db: Db, userId: string, ctx: SessionContext, continuation?: Continuation) {
  const raw = generateOpaqueToken();
  const now = new Date();
  await db.refreshToken.create({
    data: {
      userId,
      tokenHash: hashToken(raw),
      expiresAt: new Date(now.getTime() + refreshLifetimeMs(env.JWT_REFRESH_EXPIRY)),
      lastUsedAt: now,
      ipAddress: ctx.ipAddress,
      // A rotated token joins its session: start time and device carry over, the address updates.
      userAgent: continuation ? continuation.userAgent : ctx.userAgent,
      ...(continuation ? { sessionId: continuation.sessionId, startedAt: continuation.startedAt } : {}),
    },
  });
  return raw;
}

function accessTokenFor(user: PublicUser): string {
  return signAccessToken(
    { sub: user.id, accessLevel: user.accessLevel, grants: user.grants },
    env.JWT_ACCESS_SECRET,
    env.JWT_ACCESS_EXPIRY,
  );
}

export async function login(email: string, password: string, ctx: SessionContext): Promise<SessionResult> {
  const row = await prisma.user.findUnique({ where: { email } });
  // Same answer for unknown email, wrong password and inactive account, so none can be probed.
  const passwordOk = await verifyPassword(password, row?.passwordHash ?? (await DUMMY_HASH));
  if (!row || !passwordOk || !row.isActive) {
    throw new AppError(401, INVALID_CREDENTIALS);
  }
  const user = await loadPublicUser(prisma, row.id);
  const refreshToken = await issueRefreshToken(prisma, row.id, ctx);
  return { accessToken: accessTokenFor(user), refreshToken, user };
}

export async function refresh(rawToken: string, ctx: SessionContext): Promise<SessionResult> {
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    include: { user: { select: { isActive: true } } },
  });
  if (!stored || stored.revokedAt || stored.expiresAt.getTime() < Date.now()) {
    throw new AppError(401, 'Invalid refresh token');
  }
  if (!stored.user.isActive) {
    await prisma.refreshToken.updateMany({
      where: { sessionId: stored.sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw new AppError(401, 'Invalid refresh token');
  }

  const refreshToken = await prisma.$transaction(async (tx) => {
    // Conditional revoke: of two concurrent refreshes with one cookie, only one wins.
    const claimed = await tx.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (claimed.count !== 1) throw new AppError(401, 'Invalid refresh token');
    return issueRefreshToken(tx, stored.userId, ctx, stored);
  });
  // The role is re-read so access changes apply within one access-token lifetime.
  const user = await loadPublicUser(prisma, stored.userId);
  return { accessToken: accessTokenFor(user), refreshToken, user };
}

export async function logout(rawToken: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashToken(rawToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  currentRawToken: string | undefined,
): Promise<PublicUser> {
  const row = await prisma.user.findUnique({ where: { id: userId } });
  if (!row?.isActive) throw new AppError(401, 'Invalid or expired access token');
  if (!(await verifyPassword(currentPassword, row.passwordHash))) {
    throw new AppError(400, 'Current password is incorrect');
  }
  const passwordHash = await hashPassword(newPassword);
  const current = currentRawToken
    ? await prisma.refreshToken.findFirst({ where: { userId, tokenHash: hashToken(currentRawToken), revokedAt: null } })
    : null;
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { passwordHash, mustChangePassword: false } }),
    // The caller's own session survives; every other device (e.g. a stolen one) is signed out.
    prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null, ...(current ? { sessionId: { not: current.sessionId } } : {}) },
      data: { revokedAt: new Date() },
    }),
  ]);
  return loadPublicUser(prisma, userId);
}
