import { expect, it, vi } from 'vitest';
import { COST_CATEGORIES, seedCostCategories } from './cost-categories.js';

it('creates the starter cost categories once and keeps a renamed one as it was', async () => {
  const rows = new Map<string, { code: string; name: string }>();
  const client = {
    costCategory: {
      findUnique: vi.fn(async ({ where }: { where: { code: string } }) => rows.get(where.code) ?? null),
      create: vi.fn(async ({ data }: { data: { code: string; name: string } }) => (rows.set(data.code, data), data)),
    },
  };
  await seedCostCategories(client as never);
  expect(rows.size).toBe(COST_CATEGORIES.length);
  rows.set('EXP-RNT-001', { code: 'EXP-RNT-001', name: 'Rent' });
  await seedCostCategories(client as never);
  expect(client.costCategory.create).toHaveBeenCalledTimes(COST_CATEGORIES.length);
  expect(rows.get('EXP-RNT-001')?.name).toBe('Rent');
});
