import type { Response } from 'express';

import { prisma } from '@erp/db';
import { AppError } from '@erp/utils';
import { officeToday } from '../dates.js';
import type { Actor } from '../actor.js';
import { writeAudit } from '@erp/audit';
import { formatDateOnly } from '../dates.js';
import { toCsvFile } from './export.csv.js';
import type { ExportFormat, ExportSpec } from './export.types.js';
import { toXlsx } from './export.xlsx.js';

export const MAX_EXPORT_ROWS = 20_000;

// PDF export arrives with payslips in Plan 5.
const FORMATS: readonly ExportFormat[] = ['xlsx', 'csv'];

export function parseExportFormat(value: unknown): ExportFormat {
  if (typeof value === 'string' && (FORMATS as readonly string[]).includes(value)) {
    return value as ExportFormat;
  }
  throw new AppError(400, 'Choose a file type: xlsx or csv.');
}

const MIME: Record<ExportFormat, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv; charset=utf-8',
};

async function build(spec: ExportSpec, format: ExportFormat): Promise<Buffer> {
  if (format === 'xlsx') return toXlsx(spec);
  return toCsvFile(spec);
}

export interface SendExportArgs {
  res: Response;
  spec: ExportSpec;
  format: ExportFormat;
  /** `suppliers` gives `suppliers-2026-10-04.xlsx`. */
  baseName: string;
  actor: Actor;
  /** The audit row's entityId, for example `SUPPLIERS`. */
  list: string;
  /** The filters that produced the rows. Stored in the audit row. */
  filter?: Record<string, unknown>;
}

/**
 * Builds the file, writes the audit row, then sends. The audit row comes
 * first on purpose: no file leaves the system without a trace of who took it.
 */
export async function sendExport(args: SendExportArgs): Promise<void> {
  const { res, spec, format, baseName, actor, list, filter } = args;

  if (spec.rows.length > MAX_EXPORT_ROWS) {
    throw new AppError(
      400,
      'This list has too many rows to export at once. Add a filter and try again.',
    );
  }

  const body = await build(spec, format);

  await prisma.$transaction((tx) =>
    writeAudit(tx, {
      entity: 'DATA_EXPORT',
      entityId: list,
      action: 'EXPORT',
      changedBy: actor.sub,
      // JSON round trip drops `undefined` values, which Prisma's JSON type rejects.
      after: JSON.parse(JSON.stringify({ format, rows: spec.rows.length, filter: filter ?? {} })),
    }),
  );

  res.setHeader('Content-Type', MIME[format]);
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${baseName}-${formatDateOnly(officeToday())}.${format}"`,
  );
  res.send(body);
}
