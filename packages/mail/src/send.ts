import type { Prisma } from '@erp/db';
import { prisma } from '@erp/db';
import type { DispatchKind, SendMailInput, SendMailResult } from './kinds.js';
import { getTransport } from './transport.js';

/** A test-only seam: replaces the transport so sends never touch real SMTP. */
export { setTransportForTests } from './transport.js';

/** The width a kind occupies in the dispatch log, so `kind` is never free text. */
export const MAIL_KINDS: readonly DispatchKind[] = [
  'CREDENTIALS',
  'PASSWORD_CHANGED',
  'EMAIL_CHANGE_WARNING',
  'EMAIL_CHANGE_CONFIRM',
  'EMAIL_CHANGED',
  'PAYSLIP',
  'SETTLEMENT_STATEMENT',
] as const;

/**
 * Record first, send, then update the row. Never throws: a mail outage must
 * never surface as a failure on an operation that already committed.
 *
 * With no `SMTP_HOST` (and no stub transport), the row is written with neither
 * `sentAt` nor `error` — status `SKIPPED` — and the caller is told so.
 */
export async function sendMail(input: SendMailInput): Promise<SendMailResult> {
  const row = await prisma.emailDispatch.create({
    data: {
      to: input.to,
      kind: input.kind,
      subject: input.subject,
      entity: input.entity ?? null,
      entityId: input.entityId ?? null,
    },
    select: { id: true },
  });

  const transport = getTransport();
  if (!transport) {
    return { dispatchId: row.id, status: 'SKIPPED' };
  }

  try {
    await transport.sendMail({
      from: typeof process !== 'undefined' && process.env && process.env.MAIL_FROM ? process.env.MAIL_FROM : undefined,
      to: input.to,
      subject: input.subject,
      html: input.html,
      attachments: input.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType,
      })),
    });
    await prisma.emailDispatch.update({
      where: { id: row.id },
      data: { sentAt: new Date() },
    });
    return { dispatchId: row.id, status: 'SENT' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.emailDispatch.update({
      where: { id: row.id },
      data: { error: message },
    });
    return { dispatchId: row.id, status: 'FAILED' };
  }
}

/** Derived status: sentAt set means SENT, error set means FAILED, neither means SKIPPED. */
export function dispatchStatus(row: { sentAt: Date | null; error: string | null }): 'SENT' | 'FAILED' | 'SKIPPED' {
  if (row.sentAt) return 'SENT';
  if (row.error) return 'FAILED';
  return 'SKIPPED';
}

export interface DispatchListQuery {
  kind?: DispatchKind;
  entity?: string;
  entityId?: string;
  limit?: number;
  offset?: number;
}

export interface DispatchRow {
  id: string;
  to: string;
  kind: string;
  subject: string;
  entity: string | null;
  entityId: string | null;
  sentAt: Date | null;
  error: string | null;
  createdAt: Date;
}

/**
 * List dispatch rows for the Part D email log. Filters are optional and
 * combined; `kind` is validated against the declared kinds.
 */
export async function listDispatches(query: DispatchListQuery = {}): Promise<DispatchRow[]> {
  if (query.kind !== undefined && !MAIL_KINDS.includes(query.kind)) {
    throw new Error(`Unknown dispatch kind: ${query.kind}`);
  }
  const where: Prisma.EmailDispatchWhereInput = {};
  if (query.kind) where.kind = query.kind;
  if (query.entity) where.entity = query.entity;
  if (query.entityId) where.entityId = query.entityId;
  const rows = await prisma.emailDispatch.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: query.limit ?? 50,
    skip: query.offset ?? 0,
  });
  return rows.map((r) => ({
    id: r.id,
    to: r.to,
    kind: r.kind,
    subject: r.subject,
    entity: r.entity,
    entityId: r.entityId,
    sentAt: r.sentAt,
    error: r.error,
    createdAt: r.createdAt,
  }));
}
