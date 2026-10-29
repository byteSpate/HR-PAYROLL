import { expect, it, vi } from 'vitest';
import { EXPENSE_CATEGORIES, seedExpenseCategories } from './expense-categories.js';

it('creates the standard categories once and keeps a renamed one as it was', async () => {
  const rows = new Map<string, { code: string; name: string }>();
  const client = {
    expenseCategory: {
      findUnique: vi.fn(async ({ where }: { where: { code: string } }) => rows.get(where.code) ?? null),
      create: vi.fn(async ({ data }: { data: { code: string; name: string } }) => {
        rows.set(data.code, data);
        return data;
      }),
    },
  };

  await seedExpenseCategories(client as never);
  expect([...rows.keys()].sort()).toEqual(['ENTERTAINMENT', 'IT', 'MEDICAL', 'OTHER', 'STATIONERY', 'TRAINING', 'TRAVEL']);
  expect(rows.get('TRAVEL')?.name).toBe('Travel and conveyance');

  rows.set('TRAVEL', { code: 'TRAVEL', name: 'Travel & conveyance' });
  await seedExpenseCategories(client as never);
  expect(client.expenseCategory.create).toHaveBeenCalledTimes(EXPENSE_CATEGORIES.length);
  expect(rows.get('TRAVEL')?.name).toBe('Travel & conveyance');
});
