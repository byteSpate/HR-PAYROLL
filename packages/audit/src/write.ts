import type { Prisma, Tx } from '@erp/db';

export type AuditAction =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'APPROVE'
  | 'REJECT'
  | 'CANCEL'
  | 'IMPORT'
  | 'EXPORT'
  | 'EXIT'
  | 'ACTIVATE'
  | 'DEACTIVATE'
  | 'SUBMIT'
  | 'ORDER'
  | 'FULFIL'
  | 'ASSIGN'
  | 'RETURN'
  | 'ACKNOWLEDGE'
  | 'RETIRE'
  | 'MARK_LOST'
  | 'CAPITALISE'
  | 'PAY'
  | 'SEND_REPAIR'
  | 'RECEIVE_REPAIR'
  | 'WAIVE'
  | 'PROCESS'
  | 'DISBURSE';

export interface AuditEntry {
  entity: string;
  entityId: string;
  action: AuditAction;
  changedBy: string;
  /** Only the fields that changed, not whole snapshots. */
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  /** Why, in the decider's own words; a request's timeline reads it back. */
  note?: string | null;
}

// Always called with the transaction that makes the change: a write without its audit row is a bug.
export function writeAudit(tx: Tx, entry: AuditEntry) {
  return tx.auditLog.create({ data: entry });
}

const same = (a: unknown, b: unknown) =>
  a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : a === b;

/** The changed keys only, so audit rows show what moved; null when nothing did. */
export function diffFields<T extends object>(
  before: T,
  after: Partial<T>,
): { before: Partial<T>; after: Partial<T> } | null {
  const was: Partial<T> = {};
  const now: Partial<T> = {};
  for (const key of Object.keys(after) as (keyof T)[]) {
    if (same(before[key], after[key])) continue;
    was[key] = before[key];
    now[key] = after[key];
  }
  return Object.keys(now).length === 0 ? null : { before: was, after: now };
}
