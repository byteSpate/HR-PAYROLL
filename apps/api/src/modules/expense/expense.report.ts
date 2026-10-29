import { reportQuery, type ExpenseReport, type ExpenseReportRow, type ExpenseStatus, type ReportQuery } from '@erp/contracts/expense';
import { dec, prisma, ZERO, type Money } from '@erp/db';
import { MS_PER_DAY, formatDateOnly, parseDateOnly, toCsv } from '@erp/export';
import { AppError } from '@erp/utils';
import type { Viewer } from '../employee/employee.access.js';
import { scopeForViewer } from '../employee/employee.scope.js';
import { employeeOf } from '../employee/employee.self.js';

// Expense claims over a date range, per person or across everybody: one range function, one shape,
// JSON, CSV and PDF off the same object, so the totals cannot be wrong in a second place.
//
// The range is the spend date, never the day the claim was filed: a July taxi fare sent in August
// belongs to July, and a report ranged on filing date would put it in the wrong month for anyone who claims late.

/** Two years: a claim is one row per spend, so a wide range is cheap, but "everything" is not a report. */
export const MAX_REPORT_DAYS = 732;

export function resolveRange(from: string, to: string): { start: Date; end: Date } {
  const start = parseDateOnly(from);
  const end = parseDateOnly(to);
  if (end.getTime() < start.getTime()) throw new AppError(400, '`to` must not be earlier than `from`');
  const span = Math.round((end.getTime() - start.getTime()) / MS_PER_DAY) + 1;
  if (span > MAX_REPORT_DAYS) throw new AppError(400, `A report must not span more than ${MAX_REPORT_DAYS} days`);
  return { start, end };
}

/**
 * Who a report may be about is decided from the caller, not from a query parameter. Without expense.report
 * a person gets their own claims and asking for anyone else is a 403; with it, the grant's scope narrows the
 * rows and naming someone outside that scope is a 403 too.
 */
async function reachFor(viewer: Viewer, employeeId: string | undefined) {
  const scope = await scopeForViewer(viewer, 'expense.report').catch(() => null);
  if (scope === null) {
    const self = await employeeOf(viewer.sub);
    if (employeeId && employeeId !== self.id) throw new AppError(403, 'You may only report on your own expense claims');
    return { employee: { id: self.id }, named: self.id };
  }
  if (employeeId && (await prisma.employee.count({ where: { AND: [scope, { id: employeeId }] } })) === 0) {
    throw new AppError(403, 'That person is outside the claims you may report on');
  }
  return { employee: scope, named: employeeId };
}

export async function getExpenseReport(viewer: Viewer, input: Omit<ReportQuery, 'format'>): Promise<ExpenseReport> {
  const query = input;
  const { start, end } = resolveRange(query.from, query.to);
  const reach = await reachFor(viewer, query.employeeId);

  const rows = await prisma.expenseClaim.findMany({
    where: {
      employee: reach.employee,
      // Inclusive at both ends: the spend date is a calendar date, so `lte end` catches the end day itself.
      expenseDate: { gte: start, lte: end },
      ...(reach.named ? { employeeId: reach.named } : {}),
      ...(query.status ? { status: query.status } : {}),
    },
    include: {
      employee: { select: { id: true, fullName: true, employeeCode: true } },
      category: { select: { code: true, name: true } },
      _count: { select: { attachments: true } },
    },
    // Date then person, so a range reads as a diary rather than one person's history interleaved with everyone's.
    orderBy: [{ expenseDate: 'asc' }, { employeeId: 'asc' }],
  });

  // Money is summed per currency and never across them: a BDT total that quietly included a USD claim is a
  // number nobody can use and nobody can spot.
  const byCurrency = new Map<string, { claims: number; amount: Money }>();
  const byStatus = new Map<ExpenseStatus, { claims: number; money: Map<string, Money> }>();

  const mapped: ExpenseReportRow[] = rows.map((claim) => {
    const currency = claim.currency;
    const total = byCurrency.get(currency) ?? { claims: 0, amount: ZERO };
    byCurrency.set(currency, { claims: total.claims + 1, amount: total.amount.plus(claim.amount) });
    const bucket = byStatus.get(claim.status) ?? { claims: 0, money: new Map<string, Money>() };
    bucket.claims += 1;
    bucket.money.set(currency, (bucket.money.get(currency) ?? ZERO).plus(claim.amount));
    byStatus.set(claim.status, bucket);

    const foreign = currency !== 'BDT' && claim.fxRateToBdt !== null;
    return {
      id: claim.id,
      employee: claim.employee,
      name: claim.name,
      category: claim.category,
      expenseDate: formatDateOnly(claim.expenseDate),
      amount: claim.amount.toFixed(2),
      currency,
      status: claim.status,
      description: claim.description,
      travelFrom: claim.travelFrom,
      travelTo: claim.travelTo,
      receipts: claim._count.attachments,
      // Which payslip paid it: filled in when payroll arrives and the payslip can be named.
      paidOn: null,
      submittedOn: formatDateOnly(claim.createdAt),
      // A BDT claim has nothing to convert, and a foreign one has a rate only once approved: a pending claim shows none rather than a guess.
      fxRateToBdt: foreign ? claim.fxRateToBdt!.toFixed(6) : null,
      amountBdt: foreign ? dec(claim.amount).times(claim.fxRateToBdt!).toFixed(2) : null,
      reviewedOn: claim.decidedAt ? formatDateOnly(claim.decidedAt) : null,
      reviewNote: claim.decisionNote,
    };
  });

  const asCurrency = (c: string) => c as 'BDT' | 'USD';
  return {
    from: query.from,
    to: query.to,
    // Present only when the whole report is about one person, otherwise the header would name whoever filed first.
    employee: reach.named ? (mapped[0]?.employee ?? null) : null,
    status: query.status ?? null,
    rows: mapped,
    totals: {
      claims: mapped.length,
      byCurrency: [...byCurrency.entries()].map(([currency, t]) => ({ currency: asCurrency(currency), claims: t.claims, amount: t.amount.toFixed(2) })).sort((a, b) => a.currency.localeCompare(b.currency)),
      byStatus: [...byStatus.entries()]
        .map(([status, b]) => ({
          status,
          claims: b.claims,
          byCurrency: [...b.money.entries()].map(([currency, amount]) => ({ currency: asCurrency(currency), amount: amount.toFixed(2) })).sort((a, c) => a.currency.localeCompare(c.currency)),
        }))
        .sort((a, b) => a.status.localeCompare(b.status)),
    },
  };
}

export const parseReportQuery = (query: unknown) => reportQuery.parse(query);

const HEADERS = ['Date', 'EmployeeCode', 'Employee', 'Expense', 'CategoryCode', 'Category', 'Description', 'From', 'To', 'Amount', 'Currency', 'Status', 'Receipts', 'ReimbursedOn', 'SentOn', 'RateToBdt', 'AmountBdt', 'ReviewedOn', 'ReviewNote'] as const;

export function reportToCsv(report: ExpenseReport): string {
  return toCsv(
    HEADERS,
    report.rows.map((r) => [r.expenseDate, r.employee.employeeCode, r.employee.fullName, r.name, r.category.code, r.category.name, r.description ?? '', r.travelFrom ?? '', r.travelTo ?? '', r.amount, r.currency, r.status, String(r.receipts), r.paidOn ?? '', r.submittedOn, r.fxRateToBdt ?? '', r.amountBdt ?? '', r.reviewedOn ?? '', r.reviewNote ?? '']),
  );
}

/** The range is in the filename because a downloads folder loses context. */
export function reportFilename(report: ExpenseReport, ext: 'csv' | 'pdf'): string {
  const who = report.employee ? `-${report.employee.employeeCode}` : '';
  return `expenses${who}-${report.from}-to-${report.to}.${ext}`;
}
