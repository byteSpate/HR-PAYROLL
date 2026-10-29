import { writeAudit } from '@erp/audit';
import { dec, prisma } from '@erp/db';
import { emit } from '@erp/events';
import { cellText, isValidIsoDate, parseDateOnly, runCommit, runPreview, type ColumnSpec, type ImportPreview, type ImportSpec, type ParsedRow, type RowIssue, type SampleRow } from '@erp/export';

// Costs imported with a `paidAt` arrive already paid; without one they arrive pending. All or nothing.

export const COST_IMPORT_COLUMNS: ColumnSpec[] = [
  { header: 'categoryCode', required: true, type: 'text', description: 'The code of a cost category, like RENT. The category must already exist in Cost categories.', example: 'RENT' },
  { header: 'label', required: true, type: 'text', description: 'What the bill is for.', example: 'Office rent, October' },
  { header: 'payee', required: true, type: 'text', description: 'Who we pay.', example: 'Dhanmondi Properties' },
  { header: 'periodMonth', required: true, type: 'integer', description: 'The month the bill is for, as a number from 1 to 12. This is the month it covers, not the month it was paid.', example: '10' },
  { header: 'periodYear', required: true, type: 'integer', description: 'The year the bill is for, like 2026. It cannot be more than one year ahead.', example: '2026' },
  { header: 'amount', required: true, type: 'decimal', description: 'The amount, as a number with no currency sign, like 150000 or 150000.50.', example: '150000' },
  { header: 'currency', required: false, type: 'choice', allowed: ['BDT'], description: 'The currency of the amount. Leave blank for BDT.', example: 'BDT' },
  { header: 'dueDate', required: false, type: 'date', description: 'The day the bill must be paid by, written YYYY-MM-DD.', example: '2026-10-05' },
  { header: 'paidAt', required: false, type: 'date', description: 'The day it was paid, written YYYY-MM-DD. If you fill this in, the bill is added as Paid. If you leave it blank, the bill is added as Pending.', example: '2026-10-04' },
  { header: 'paymentRef', required: false, type: 'text', description: 'A cheque number or transfer reference.', example: 'CHQ-0001' },
  { header: 'notes', required: false, type: 'text', description: 'Any other note.', example: '' },
];

export function costImportSampleRows(today: Date): SampleRow[] {
  const month = String(today.getUTCMonth() + 1);
  const year = String(today.getUTCFullYear());
  const day = today.toISOString().slice(0, 10);
  return [
    { categoryCode: 'RENT', label: 'Office rent', payee: 'Dhanmondi Properties', periodMonth: month, periodYear: year, amount: '150000', currency: 'BDT', dueDate: day, paidAt: day, paymentRef: 'CHQ-0001', notes: '' },
    { categoryCode: 'ELECTRICITY', label: 'Electricity bill', payee: 'DESCO', periodMonth: month, periodYear: year, amount: '18500.50', currency: 'BDT', dueDate: day, paidAt: '', paymentRef: '', notes: '' },
  ];
}

interface CostImportRow {
  rowNumber: number;
  categoryId: string;
  label: string;
  payee: string;
  periodMonth: number;
  periodYear: number;
  amount: string;
  dueDate?: string;
  paidAt?: string;
  paymentRef?: string;
  notes?: string;
}

/** OperatingCost.amount is Decimal(14,2). */
const MONEY = /^\d{1,12}(\.\d{1,2})?$/;

function makeValidateRow(categories: Map<string, { id: string }>) {
  return (row: ParsedRow): { ok: true; value: CostImportRow } | { ok: false; issues: RowIssue[] } => {
    const issues: RowIssue[] = [];
    const cell = (key: string) => cellText(row.values, key);
    const flag = (column: string, message: string) => issues.push({ rowNumber: row.rowNumber, column, message });

    const code = cell('categoryCode');
    const category = categories.get(code.toUpperCase());
    if (!category) flag('categoryCode', `Unknown category code "${code}"`);

    const month = Number(cell('periodMonth'));
    if (!Number.isInteger(month) || month < 1 || month > 12) flag('periodMonth', 'periodMonth must be an integer between 1 and 12');
    const year = Number(cell('periodYear'));
    if (!Number.isInteger(year) || year < 2000) flag('periodYear', 'periodYear must be an integer no earlier than 2000');
    else if (year > new Date().getUTCFullYear() + 1) flag('periodYear', 'periodYear cannot be more than one year ahead of the current year');

    const amount = cell('amount');
    if (!MONEY.test(amount)) flag('amount', 'amount must be a non-negative number with at most two decimals');
    const currency = cell('currency').toUpperCase();
    if (currency && currency !== 'BDT') flag('currency', `Operating costs are recorded in BDT, not "${currency}"`);

    const date = (header: string) => {
      const raw = cell(header);
      if (!raw) return undefined;
      if (isValidIsoDate(raw)) return raw;
      flag(header, 'Expected a YYYY-MM-DD date');
      return undefined;
    };
    const dueDate = date('dueDate');
    const paidAt = date('paidAt');

    if (issues.length > 0 || !category) return { ok: false, issues };
    return { ok: true, value: { rowNumber: row.rowNumber, categoryId: category.id, label: cell('label'), payee: cell('payee'), periodMonth: month, periodYear: year, amount, dueDate, paidAt, paymentRef: cell('paymentRef') || undefined, notes: cell('notes') || undefined } };
  };
}

async function buildSpec(): Promise<ImportSpec<CostImportRow>> {
  const categories = new Map((await prisma.costCategory.findMany()).map((c) => [c.code.toUpperCase(), c]));
  return {
    columns: COST_IMPORT_COLUMNS,
    validateRow: makeValidateRow(categories),
    summarise: (rows) => {
      const paid = rows.filter((r) => r.paidAt).length;
      return { costs: rows.length, paid, pending: rows.length - paid };
    },
  };
}

export async function previewCostImport(buffer: Buffer, fileName: string): Promise<ImportPreview<CostImportRow>> {
  return runPreview(buffer, fileName, await buildSpec());
}

export async function commitCostImport(buffer: Buffer, fileName: string, actor: { sub: string }) {
  return runCommit(buffer, fileName, await buildSpec(), (rows) =>
    prisma.$transaction(async (tx) => {
      let paidCount = 0;
      for (const row of rows) {
        const paid = row.paidAt !== undefined;
        if (paid) paidCount += 1;
        const cost = await tx.operatingCost.create({
          data: {
            categoryId: row.categoryId, label: row.label, payee: row.payee, periodMonth: row.periodMonth, periodYear: row.periodYear, amount: dec(row.amount), currency: 'BDT',
            dueDate: row.dueDate ? parseDateOnly(row.dueDate) : null, notes: row.notes ?? null, createdBy: actor.sub,
            status: paid ? 'PAID' : 'PENDING', paidAt: row.paidAt ? parseDateOnly(row.paidAt) : null, paidBy: paid ? actor.sub : null, paymentRef: row.paymentRef ?? null,
          },
          include: { category: true },
        });
        await writeAudit(tx, { entity: 'COST', entityId: cost.id, action: 'IMPORT', changedBy: actor.sub, after: { categoryId: row.categoryId, label: row.label, periodMonth: row.periodMonth, periodYear: row.periodYear, status: cost.status } });
      }
      // One event for the file, never one per row: historical bills are history, not news.
      await emit(tx, 'cost.bill.accrued', { imported: rows.length, paid: paidCount, actorUserId: actor.sub });
      return { costCount: rows.length, paidCount };
    }),
  );
}
