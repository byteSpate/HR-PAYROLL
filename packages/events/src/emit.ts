import type { Prisma, Tx } from '@erp/db';

// Takes only a transaction client so the outbox row commits or rolls back with the
// business write that caused it. Delivery happens elsewhere, so nothing here sends events.
export async function emit<T>(tx: Tx, type: string, payload: T): Promise<{ id: string }> {
  const row = await tx.outboxEvent.create({
    data: { type, payload: payload as Prisma.InputJsonValue },
    select: { id: true },
  });
  return { id: row.id };
}
