import { expect, it, vi } from 'vitest';
import { ASSET_CATEGORIES, seedAssetCategories } from './asset-categories.js';

it('creates the starter categories once and keeps an edited one as it was', async () => {
  const rows = new Map<string, { code: string; name: string }>();
  const client = {
    assetCategory: {
      findUnique: vi.fn(
        async ({ where }: { where: { code: string } }) => rows.get(where.code) ?? null,
      ),
      create: vi.fn(
        async ({ data }: { data: { code: string; name: string } }) => (
          rows.set(data.code, data),
          data
        ),
      ),
    },
  };
  await seedAssetCategories(client as never);
  expect([...rows.keys()].sort()).toEqual([
    'FURNITURE',
    'LAPTOP',
    'LICENCE',
    'MONITOR',
    'PHONE',
    'STATIONERY',
  ]);
  rows.set('LAPTOP', { code: 'LAPTOP', name: 'Notebook' });
  await seedAssetCategories(client as never);
  expect(client.assetCategory.create).toHaveBeenCalledTimes(ASSET_CATEGORIES.length);
  expect(rows.get('LAPTOP')?.name).toBe('Notebook');
});
