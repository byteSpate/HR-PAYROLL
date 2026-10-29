import type { NextFunction, Request, Response } from 'express';
import type { ListCostsQuery } from '@erp/contracts/cost';
import { parseExportFormat, sendExport, type ExportSpec } from '@erp/export';
import { listCosts, parseListQuery } from './cost.service.js';

function filterNote(filters: ListCostsQuery): string | undefined {
  const parts: string[] = [];
  if (filters.year !== undefined && filters.month !== undefined)
    parts.push(`Month ${filters.month}/${filters.year}`);
  else if (filters.year !== undefined) parts.push(`Year ${filters.year}`);
  else if (filters.month !== undefined) parts.push(`Month ${filters.month}`);
  if (filters.categoryId) parts.push('One category only');
  if (filters.status) parts.push(`Status: ${filters.status}`);
  return parts.length > 0 ? parts.join(', ') : undefined;
}

export async function buildCostExportSpec(filters: ListCostsQuery): Promise<ExportSpec> {
  const bills = await listCosts(filters);
  return {
    title: 'Operating costs',
    filterNote: filterNote(filters),
    columns: [
      { header: 'categoryCode', type: 'text' },
      { header: 'label', type: 'text' },
      { header: 'payee', type: 'text' },
      { header: 'periodMonth', type: 'integer' },
      { header: 'periodYear', type: 'integer' },
      { header: 'amount', type: 'decimal' },
      { header: 'currency', type: 'text' },
      { header: 'dueDate', type: 'date' },
      { header: 'paidAt', type: 'date' },
      { header: 'paymentRef', type: 'text' },
      { header: 'notes', type: 'text' },
      { header: 'status', type: 'text' },
      { header: 'isOverdue', type: 'boolean' },
    ],
    rows: bills.map((b) => [
      b.category.code,
      b.label,
      b.payee,
      b.periodMonth,
      b.periodYear,
      Number(b.amount),
      b.currency,
      b.dueDate,
      b.paidAt,
      b.paymentRef,
      b.notes,
      b.status,
      b.isOverdue,
    ]),
  };
}

export async function exportCostsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const format = parseExportFormat(req.query['format']);
    const filters = parseListQuery(req.query);
    await sendExport({
      res,
      spec: await buildCostExportSpec(filters),
      format,
      baseName: 'operating-costs',
      actor: req.user!,
      list: 'COSTS',
      filter: filters,
    });
  } catch (err) {
    next(err);
  }
}
