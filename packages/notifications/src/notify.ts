import type { Tx } from '@erp/db';

export interface NotifyInput {
  userId: string;
  type: string;
  title: string;
  body?: string;
  href?: string;
  entity?: string;
  entityId?: string;
}

// A double-clicked button or a retried request must not stack identical notices.
const DUPLICATE_WINDOW_MS = 60_000;

/**
 * Writes in-app notices inside the caller's transaction, so a notice exists exactly when the change
 * that caused it does. An identical (user, type, record) notice created in the last minute is skipped.
 */
export async function notify(tx: Tx, input: NotifyInput | NotifyInput[]): Promise<void> {
  const since = new Date(Date.now() - DUPLICATE_WINDOW_MS);
  // Sequential on purpose: a second identical input in the same batch must see the first.
  for (const n of Array.isArray(input) ? input : [input]) {
    const recent = await tx.notification.findFirst({
      where: {
        userId: n.userId,
        type: n.type,
        entity: n.entity ?? null,
        entityId: n.entityId ?? null,
        createdAt: { gte: since },
      },
      select: { id: true },
    });
    if (recent) continue;
    await tx.notification.create({
      data: {
        userId: n.userId,
        type: n.type,
        title: n.title,
        body: n.body ?? null,
        href: n.href ?? null,
        entity: n.entity ?? null,
        entityId: n.entityId ?? null,
      },
    });
  }
}
