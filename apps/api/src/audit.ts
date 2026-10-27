import type { Prisma, Tx } from '@erp/db';

export interface AuditEntry {
  entity: 'USER' | 'ROLE';
  entityId: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  changedBy: string;
  /** Only the fields that changed, not whole snapshots. */
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
}

// Always called with the transaction that makes the change: a write without its audit row is a bug.
export function writeAudit(tx: Tx, entry: AuditEntry) {
  return tx.auditLog.create({ data: entry });
}
