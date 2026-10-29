import { z } from 'zod';
import type { AccountView } from '@erp/contracts/core';
import { avatarUrlFor, getStorage, packAvatar, publicIdOfAvatar, requireStorage, type UploadFile } from '@erp/attachments';
import { prisma } from '@erp/db';
import { AppError } from '@erp/utils';

// null clears the name; a blank string is a mistake, not a request to clear.
const displayNameSchema = z.object({ displayName: z.string().trim().min(1).max(100).nullable() });

export async function getAccount(userId: string): Promise<AccountView> {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { role: { select: { id: true, name: true } } } });
  if (!user) throw new AppError(401, 'Invalid or expired access token');
  const live = await prisma.refreshToken.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    select: { sessionId: true, lastUsedAt: true },
  });
  const lastUsed = live.reduce<Date | null>((latest, t) => (latest === null || t.lastUsedAt > latest ? t.lastUsedAt : latest), null);
  return {
    email: user.email,
    accessLevel: user.accessLevel,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
    createdAt: user.createdAt.toISOString(),
    // A session is one sign-in however many times its token has rotated.
    sessions: { count: new Set(live.map((t) => t.sessionId)).size, lastActiveAt: lastUsed?.toISOString() ?? null },
    displayName: user.displayName,
    avatarUrl: avatarUrlFor(user.avatarUrl),
  };
}

/** Staff keep their name on the employee record, so this is only for accounts that have none. Null falls back to the email. */
export async function setDisplayName(userId: string, input: unknown): Promise<AccountView> {
  const { displayName } = displayNameSchema.parse(input);
  if (await prisma.employee.count({ where: { userId } })) throw new AppError(409, 'Edit your name on your employee profile');
  await prisma.user.update({ where: { id: userId }, data: { displayName } });
  return getAccount(userId);
}

export async function logoutEverywhere(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
}

export async function setOwnAvatar(userId: string, file: UploadFile | undefined): Promise<AccountView> {
  if (!file) throw new AppError(400, 'Choose an image to upload');
  const storage = requireStorage();
  const previous = (await prisma.user.findUnique({ where: { id: userId }, select: { avatarUrl: true } }))?.avatarUrl;
  const stored = await storage.upload(file, `hr/avatars/user-${userId}`);
  await prisma.user.update({ where: { id: userId }, data: { avatarUrl: packAvatar(stored.publicId, stored.version) } });
  if (previous) await storage.remove(publicIdOfAvatar(previous));
  return getAccount(userId);
}

export async function clearOwnAvatar(userId: string): Promise<AccountView> {
  const previous = (await prisma.user.findUnique({ where: { id: userId }, select: { avatarUrl: true } }))?.avatarUrl;
  if (previous) {
    await prisma.user.update({ where: { id: userId }, data: { avatarUrl: null } });
    await getStorage()?.remove(publicIdOfAvatar(previous));
  }
  return getAccount(userId);
}
