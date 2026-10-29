import type { Db } from '../client.js';

/** The starter categories. Stationery is a supply: issued by quantity, never registered as rows (ten pens is one fact, not ten assets with ten tags). */
export const ASSET_CATEGORIES = [
  {
    code: 'LAPTOP',
    name: 'Laptop',
    requiresSerial: true,
    isConsumable: false,
    usefulLifeMonths: 36,
    classification: 'IT',
    tracksIndividually: true,
  },
  {
    code: 'MONITOR',
    name: 'Monitor',
    requiresSerial: true,
    isConsumable: false,
    usefulLifeMonths: 36,
    classification: 'IT',
    tracksIndividually: true,
  },
  {
    code: 'PHONE',
    name: 'Phone',
    requiresSerial: true,
    isConsumable: false,
    usefulLifeMonths: 24,
    classification: 'IT',
    tracksIndividually: true,
  },
  {
    code: 'FURNITURE',
    name: 'Furniture',
    requiresSerial: false,
    isConsumable: false,
    usefulLifeMonths: 60,
    classification: 'NON_IT',
    tracksIndividually: true,
  },
  {
    code: 'LICENCE',
    name: 'Software licence',
    requiresSerial: false,
    isConsumable: false,
    usefulLifeMonths: 12,
    classification: 'IT',
    tracksIndividually: true,
  },
  {
    code: 'STATIONERY',
    name: 'Stationery',
    requiresSerial: false,
    isConsumable: true,
    usefulLifeMonths: null,
    classification: 'NON_IT',
    tracksIndividually: false,
  },
] as const;

/** Creates the missing ones only: a name or useful life edited since is left as it is. */
export async function seedAssetCategories(db: Db): Promise<void> {
  for (const category of ASSET_CATEGORIES) {
    if (await db.assetCategory.findUnique({ where: { code: category.code } })) continue;
    await db.assetCategory.create({ data: category });
  }
}
