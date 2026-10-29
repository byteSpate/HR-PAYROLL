import type { Db } from '../client.js';

/** The categories a claim is filed under. TRAVEL and CONVEYANCE are the codes the route (From and To) rule keys on. */
export const EXPENSE_CATEGORIES = [
  { code: 'TRAVEL', name: 'Travel and conveyance' },
  { code: 'ENTERTAINMENT', name: 'Entertainment' },
  { code: 'STATIONERY', name: 'Stationery' },
  { code: 'IT', name: 'IT accessories' },
  { code: 'TRAINING', name: 'Training' },
  { code: 'MEDICAL', name: 'Medical' },
  { code: 'OTHER', name: 'Other' },
] as const;

/** Creates the missing ones only: a category renamed since is left as it is. */
export async function seedExpenseCategories(db: Db): Promise<void> {
  for (const category of EXPENSE_CATEGORIES) {
    if (await db.expenseCategory.findUnique({ where: { code: category.code } })) continue;
    await db.expenseCategory.create({ data: category });
  }
}
