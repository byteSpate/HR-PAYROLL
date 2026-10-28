import type { Db } from '@erp/db';

export interface AuditRow {
  id: string;
  entity: string;
  entityId: string;
  action: string;
  changedAt: string;
  changedBy: string | null;
  /** Null when the actor no longer exists or was a system process. */
  actorEmail: string | null;
  before: unknown;
  after: unknown;
}

export interface AuditQuery {
  entity?: string;
  entityId?: string;
  changedBy?: string;
  cursor?: string;
  limit?: number;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export async function listAudit(db: Db, q: AuditQuery): Promise<{ items: AuditRow[]; nextCursor: string | null }> {
  const limit = Math.min(Math.max(q.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  // One extra row tells whether another page exists without a count query.
  const rows = await db.auditLog.findMany({
    where: { entity: q.entity, entityId: q.entityId, changedBy: q.changedBy },
    orderBy: [{ changedAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
  });
  const page = rows.slice(0, limit);
  const actorIds = [...new Set(page.map((r) => r.changedBy).filter((id): id is string => id !== null))];
  const actors = await db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, email: true } });
  const emailById = new Map(actors.map((a) => [a.id, a.email]));

  return {
    items: page.map((r) => ({
      id: r.id,
      entity: r.entity,
      entityId: r.entityId,
      action: r.action,
      changedAt: r.changedAt.toISOString(),
      changedBy: r.changedBy,
      actorEmail: r.changedBy ? (emailById.get(r.changedBy) ?? null) : null,
      before: r.before,
      after: r.after,
    })),
    nextCursor: rows.length > limit ? (page.at(-1)?.id ?? null) : null,
  };
}
