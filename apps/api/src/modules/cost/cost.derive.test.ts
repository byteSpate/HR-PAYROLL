import { describe, expect, it } from 'vitest';
import { dec } from '@erp/db';
import { isOverdue, summariseCosts, type BillLike } from './cost.derive.js';

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const bill = (over: Partial<BillLike> = {}): BillLike => ({
  status: 'PENDING',
  dueDate: day('2026-10-01'),
  amount: dec('10.10'),
  currency: 'BDT',
  categoryId: 'c1',
  categoryName: 'Rent',
  ...over,
});

describe('isOverdue', () => {
  it('is a pending bill whose due date has passed, and nothing else', () => {
    expect(isOverdue(bill(), day('2026-10-02'))).toBe(true);
    expect(isOverdue(bill({ status: 'PAID' }), day('2026-10-02'))).toBe(false);
    expect(isOverdue(bill({ dueDate: null }), day('2026-10-02'))).toBe(false);
  });

  it('does not count the day it falls due', () => {
    expect(isOverdue(bill(), day('2026-10-01'))).toBe(false);
  });
});

describe('summariseCosts', () => {
  it('adds exactly per category and currency, never across currencies', () => {
    const summary = summariseCosts(
      [
        bill({ amount: dec('0.10') }),
        bill({ amount: dec('0.20'), status: 'PAID' }),
        bill({ amount: dec('5'), currency: 'USD' }),
      ],
      day('2026-10-02'),
    );
    expect(summary.categories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          currency: 'BDT',
          total: '0.30',
          paid: '0.20',
          outstanding: '0.10',
          billCount: 2,
        }),
        expect.objectContaining({ currency: 'USD', total: '5.00', outstanding: '5.00' }),
      ]),
    );
    expect(summary.totals.map((t) => t.currency).sort()).toEqual(['BDT', 'USD']);
    expect(summary.overdueCount).toBe(2);
  });
});
