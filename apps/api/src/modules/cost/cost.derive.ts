import { dec, sum, type Currency, type Money } from '@erp/db';
import type { CostCategoryTotal, CostCurrencyTotal, CostStatus, CostSummary } from '@erp/contracts/cost';

export interface BillLike {
  status: CostStatus;
  dueDate: Date | null;
  amount: Money;
  currency: Currency;
  categoryId: string;
  categoryName: string;
}

/**
 * Overdue is derived on read and never stored: a stored flag needs a job to keep it true. A bill is overdue
 * when it is still pending and its due date is before `today`, so the day it falls due is not yet late.
 */
export function isOverdue(bill: Pick<BillLike, 'status' | 'dueDate'>, today: Date): boolean {
  return bill.status === 'PENDING' && bill.dueDate !== null && bill.dueDate < today;
}

const totalOf = (rows: BillLike[]) => sum(rows.map((row) => dec(row.amount)));
const figures = (rows: BillLike[]) => {
  const total = totalOf(rows);
  const paid = totalOf(rows.filter((row) => row.status === 'PAID'));
  return { total: total.toFixed(2), paid: paid.toFixed(2), outstanding: total.minus(paid).toFixed(2) };
};

/** Money is added exactly and per currency: a USD bill is never folded into a BDT total. */
export function summariseCosts(bills: BillLike[], today: Date): CostSummary {
  const buckets = new Map<string, BillLike[]>();
  for (const bill of bills) buckets.set(`${bill.categoryId}::${bill.currency}`, [...(buckets.get(`${bill.categoryId}::${bill.currency}`) ?? []), bill]);

  const categories: CostCategoryTotal[] = [...buckets.values()].map((rows) => ({
    categoryId: rows[0]!.categoryId,
    categoryName: rows[0]!.categoryName,
    currency: rows[0]!.currency,
    ...figures(rows),
    billCount: rows.length,
  }));
  const totals: CostCurrencyTotal[] = [...new Set(bills.map((b) => b.currency))].map((currency) => ({ currency, ...figures(bills.filter((b) => b.currency === currency)) }));
  return { categories, totals, overdueCount: bills.filter((b) => isOverdue(b, today)).length };
}
