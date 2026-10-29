import { z } from 'zod';
import { currencies } from '../exchange/schemas.js';

export const expenseStatuses = ['PENDING', 'APPROVED', 'REJECTED', 'REIMBURSED'] as const;
export type ExpenseStatus = (typeof expenseStatuses)[number];

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a YYYY-MM-DD date');
const optionalText = (max: number) => z.string().trim().max(max).optional();

/** Category codes whose claims describe a journey, and so carry a From and a To. */
export const ROUTE_CATEGORY_CODES = ['TRAVEL', 'CONVEYANCE'] as const;
export const hasRoute = (code: string): boolean => (ROUTE_CATEGORY_CODES as readonly string[]).includes(code.toUpperCase());

export const createClaimBody = z.object({
  name: z.string().trim().min(1, 'Give the expense a name').max(200),
  amount: z.coerce.number().positive('amount must be greater than 0'),
  categoryId: z.string().uuid(),
  currency: z.enum(currencies).default('BDT'),
  expenseDate: dateOnly,
  description: z.string().max(1000).optional(),
  travelFrom: optionalText(200),
  travelTo: optionalText(200),
});
export type CreateClaimBody = z.infer<typeof createClaimBody>;

/** Every field optional, a PATCH. The nullable ones are exactly those that can be emptied; an omitted key leaves the field alone. */
export const updateClaimBody = z
  .object({
    name: z.string().trim().min(1, 'Give the expense a name').max(200).optional(),
    amount: z.coerce.number().positive('amount must be greater than 0').optional(),
    categoryId: z.string().uuid().optional(),
    currency: z.enum(currencies).optional(),
    expenseDate: dateOnly.optional(),
    description: z.string().max(1000).nullable().optional(),
    travelFrom: z.string().trim().max(200).nullable().optional(),
    travelTo: z.string().trim().max(200).nullable().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'Nothing to change' });
export type UpdateClaimBody = z.infer<typeof updateClaimBody>;

export const approveClaimBody = z.object({ note: z.string().max(1000).optional() });
export type ApproveClaimBody = z.infer<typeof approveClaimBody>;

/** A note is required on reject. */
export const rejectClaimBody = z.object({ note: z.string().min(1, 'A note is required').max(1000) });
export type RejectClaimBody = z.infer<typeof rejectClaimBody>;

/** No note on a sweep: one sentence glued to twelve claims is no reason at all. Capped, as each is its own transaction. */
export const approveClaimsBody = z.object({ claimIds: z.array(z.string().uuid()).min(1, 'Select at least one claim').max(200) });
export type ApproveClaimsBody = z.infer<typeof approveClaimsBody>;

export const claimQuery = z.object({
  status: z.enum(expenseStatuses).optional(),
  employeeId: z.string().optional(),
});
export type ClaimQuery = z.infer<typeof claimQuery>;

export const categoryBody = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z_]+$/, 'Use upper-case letters and underscores').max(40),
  name: z.string().trim().min(1, 'A name is required').max(100),
});
export type CategoryBody = z.infer<typeof categoryBody>;

/** `from` and `to` are required: a report defaulting to a server-chosen range would print a date nobody asked for. */
export const reportQuery = z.object({
  from: dateOnly,
  to: dateOnly,
  employeeId: z.string().min(1).optional(),
  status: z.enum(expenseStatuses).optional(),
  format: z.enum(['json', 'csv', 'pdf']).default('json'),
});
export type ReportQuery = z.infer<typeof reportQuery>;
