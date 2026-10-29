import { z } from 'zod';
import { nonNegativeDecimal } from '../decimal.js';
import { currencies } from '../exchange/schemas.js';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a YYYY-MM-DD date');
export const costStatuses = ['PENDING', 'PAID'] as const;
/** OperatingCost.amount and CostCommitment.amount are Decimal(14,2). */
const costMoney = (label: string) => nonNegativeDecimal(label, 12, 2);

const periodYear = z.coerce
  .number()
  .int()
  .min(2000)
  .refine((year) => year <= new Date().getUTCFullYear() + 1, { message: 'periodYear cannot be more than one year ahead of the current year' });

export const costCategoryBody = z.object({
  code: z.string().trim().regex(/^[A-Z][A-Z0-9_-]*$/, 'Use upper-case letters, digits, dashes and underscores').max(40),
  name: z.string().trim().min(1).max(100),
});
export type CostCategoryBody = z.infer<typeof costCategoryBody>;
export const updateCostCategoryBody = z.object({ name: z.string().trim().min(1).max(100).optional() });

export const commitmentBody = z.object({
  categoryId: z.string().uuid(),
  label: z.string().trim().min(1, 'A label is required').max(200),
  payee: z.string().trim().min(1, 'A payee is required').max(200),
  amount: costMoney('amount').optional(),
  currency: z.enum(currencies).optional(),
  dueDay: z.coerce.number().int().min(1).max(31).optional(),
  startedOn: isoDate,
  notes: z.string().trim().max(2000).optional(),
});
export type CommitmentBody = z.infer<typeof commitmentBody>;

export const updateCommitmentBody = z.object({
  label: z.string().trim().min(1, 'A label is required').max(200).optional(),
  payee: z.string().trim().min(1, 'A payee is required').max(200).optional(),
  amount: costMoney('amount').nullable().optional(),
  currency: z.enum(currencies).optional(),
  dueDay: z.coerce.number().int().min(1).max(31).nullable().optional(),
  notes: z.string().trim().max(2000).optional(),
  endedOn: isoDate.nullable().optional(),
});
export type UpdateCommitmentBody = z.infer<typeof updateCommitmentBody>;

export const costBody = z.object({
  categoryId: z.string().uuid(),
  commitmentId: z.string().uuid().optional(),
  label: z.string().trim().min(1, 'A label is required').max(200),
  payee: z.string().trim().min(1, 'A payee is required').max(200),
  periodMonth: z.coerce.number().int().min(1).max(12),
  periodYear,
  amount: costMoney('amount'),
  currency: z.enum(currencies).optional(),
  dueDate: isoDate.optional(),
  notes: z.string().trim().max(2000).optional(),
});
export type CostBody = z.infer<typeof costBody>;

export const updateCostBody = z.object({
  categoryId: z.string().uuid().optional(),
  label: z.string().trim().min(1, 'A label is required').max(200).optional(),
  payee: z.string().trim().min(1, 'A payee is required').max(200).optional(),
  amount: costMoney('amount').optional(),
  currency: z.enum(currencies).optional(),
  dueDate: isoDate.nullable().optional(),
  notes: z.string().trim().max(2000).optional(),
});
export type UpdateCostBody = z.infer<typeof updateCostBody>;

export const payCostBody = z.object({ paidAt: isoDate.optional(), paymentRef: z.string().trim().max(200).optional() });
export type PayCostBody = z.infer<typeof payCostBody>;

export const listCostsQuery = z.object({
  year: z.coerce.number().int().min(2000).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  categoryId: z.string().uuid().optional(),
  status: z.enum(costStatuses).optional(),
});
export type ListCostsQuery = z.infer<typeof listCostsQuery>;

export const listCommitmentsQuery = z.object({
  active: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
});

export const summaryQuery = z.object({ year: z.coerce.number().int().min(2000), month: z.coerce.number().int().min(1).max(12) });
