import { prisma } from '@erp/db';
import { AppError } from '@erp/utils';

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string | null;
  href: string | null;
  entity: string | null;
  entityId: string | null;
  readAt: string | null;
  createdAt: string;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

// Every function takes the signed-in user's id and filters on it, so a notification id from
// someone else's list can neither be read nor marked.
export async function listNotifications(
  userId: string,
  opts: { cursor?: string; limit?: number; unreadOnly?: boolean },
): Promise<{ items: NotificationItem[]; nextCursor: string | null }> {
  const limit = Math.min(Math.max(Math.trunc(opts.limit ?? DEFAULT_LIMIT), 1), MAX_LIMIT);
  const rows = await prisma.notification.findMany({
    where: { userId, ...(opts.unreadOnly ? { readAt: null } : {}) },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  });
  const page = rows.slice(0, limit);
  return {
    items: page.map((r) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      body: r.body,
      href: r.href,
      entity: r.entity,
      entityId: r.entityId,
      readAt: r.readAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
    nextCursor: rows.length > limit ? page[page.length - 1]!.id : null,
  };
}

export const unreadCount = (userId: string): Promise<number> => prisma.notification.count({ where: { userId, readAt: null } });

export async function markRead(userId: string, id: string): Promise<void> {
  const { count } = await prisma.notification.updateMany({ where: { id, userId, readAt: null }, data: { readAt: new Date() } });
  if (count > 0) return;
  // Zero changed: either it was already read (fine) or it is not theirs (404).
  if (!(await prisma.notification.findFirst({ where: { id, userId }, select: { id: true } }))) {
    throw new AppError(404, 'Notification not found');
  }
}

export async function markAllRead(userId: string): Promise<number> {
  const { count } = await prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
  return count;
}
