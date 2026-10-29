import type { Db } from '../client.js';

/** The starter operating-cost categories. */
export const COST_CATEGORIES = [
  { code: 'EXP-SAL-001', name: 'Salary' },
  { code: 'EXP-OFF-001', name: 'Stationery and office supplies' },
  { code: 'EXP-ENT-001', name: 'Entertainment' },
  { code: 'EXP-UTL-001', name: 'Electricity' },
  { code: 'EXP-UTL-002', name: 'Water' },
  { code: 'EXP-RNT-001', name: 'Office rent' },
  { code: 'EXP-INT-001', name: 'Internet' },
  { code: 'EXP-TRN-001', name: 'Transportation' },
  { code: 'EXP-CLN-001', name: 'Cleaning' },
  { code: 'EXP-SEC-001', name: 'Security' },
  { code: 'EXP-MNT-001', name: 'Maintenance' },
  { code: 'EXP-OTH-001', name: 'Other' },
] as const;

/** Creates the missing ones only: a name edited since is left as it is. */
export async function seedCostCategories(db: Db): Promise<void> {
  for (const category of COST_CATEGORIES) {
    if (await db.costCategory.findUnique({ where: { code: category.code } })) continue;
    await db.costCategory.create({ data: category });
  }
}
