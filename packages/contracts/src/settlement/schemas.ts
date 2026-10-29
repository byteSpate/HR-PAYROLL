import { z } from 'zod';
import { nonNegativeDecimal } from '../decimal.js';

const head = (label: string) => nonNegativeDecimal(label, 12, 2).optional();

/** Every head is optional; a reason never is. An unexplained override is the one figure a dispute turns on. */
export const overrideSettlementBody = z
  .object({
    pendingSalary: head('pendingSalary'),
    gratuity: head('gratuity'),
    noticePay: head('noticePay'),
    expenseReimbursement: head('expenseReimbursement'),
    outstandingDeductions: head('outstandingDeductions'),
    assetRecoveries: head('assetRecoveries'),
    reason: z.string().min(1, 'A reason is required').max(500),
  })
  .refine(
    (b) =>
      b.pendingSalary !== undefined ||
      b.gratuity !== undefined ||
      b.noticePay !== undefined ||
      b.expenseReimbursement !== undefined ||
      b.outstandingDeductions !== undefined ||
      b.assetRecoveries !== undefined,
    { message: 'Provide at least one head to override' },
  );
export type OverrideSettlementBody = z.infer<typeof overrideSettlementBody>;

export const settlementRejectBody = z.object({
  note: z.string().min(1, 'A note is required').max(1000),
});
export type SettlementRejectBody = z.infer<typeof settlementRejectBody>;
