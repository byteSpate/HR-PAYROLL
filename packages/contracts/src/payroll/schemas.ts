import { z } from 'zod';
import { nonNegativeDecimal, positiveDecimal } from '../decimal.js';
import { currencies } from '../exchange/schemas.js';

const componentBody = z
  .object({
    code: z.string().min(1),
    label: z.string().min(1),
    kind: z.enum(['EARNING', 'DEDUCTION']),
    calc: z.enum(['FIXED', 'PERCENT_OF_BASIC']),
    // SalaryComponent.value is Decimal(10,2).
    value: nonNegativeDecimal('value', 8, 2),
    sortOrder: z.coerce.number().int().default(0),
    countsAsWages: z.coerce.boolean().default(true),
  })
  .refine(
    (c) => (c.calc === 'PERCENT_OF_BASIC' ? Number(c.value) > 0 && Number(c.value) <= 100 : true),
    {
      message: 'A PERCENT_OF_BASIC component must be greater than 0 and at most 100',
      path: ['value'],
    },
  );

export const salaryStructureBody = z
  .object({
    name: z.string().min(1),
    currency: z.enum(currencies),
    // SalaryStructure.basic is Decimal(14,2).
    basic: positiveDecimal('basic', 12, 2),
    isActive: z.coerce.boolean().default(true),
    /** Empty is the ordinary case: a structure with no components pays `basic` and is complete. */
    components: z.array(componentBody).default([]),
  })
  .refine((s) => new Set(s.components.map((c) => c.code)).size === s.components.length, {
    message: 'Component codes must be unique within a structure',
    path: ['components'],
  });
export type SalaryStructureBody = z.infer<typeof salaryStructureBody>;

export const assignStructureBody = z.object({ salaryStructureId: z.string().uuid().nullable() });
export type AssignStructureBody = z.infer<typeof assignStructureBody>;

export const createRunBody = z.object({
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2000).max(2100),
  notes: z.string().max(2000).optional(),
});
export type CreateRunBody = z.infer<typeof createRunBody>;

/** Optional. People left out of the run, sent when it is processed again. */
export const processRunBody = z
  .object({ excludedEmployeeIds: z.array(z.string().min(1)).max(5000).optional() })
  .default({});
export type ProcessRunBody = z.infer<typeof processRunBody>;

/** A note is required: "why did this come back?" must always have an answer. */
export const rejectRunBody = z.object({
  note: z.string().min(1, 'A note is required').max(1000),
});
export type RejectRunBody = z.infer<typeof rejectRunBody>;

export const adjustmentBody = z.object({
  employeeId: z.string().min(1),
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2000).max(2100),
  kind: z.enum(['EARNING', 'DEDUCTION']),
  code: z.string().min(1).max(64),
  label: z.string().min(1).max(200),
  currency: z.enum(currencies).default('BDT'),
  amount: positiveDecimal('amount', 12, 2),
  reason: z.string().min(1, 'A reason is required').max(500),
});
export type AdjustmentBody = z.infer<typeof adjustmentBody>;

export const adjustmentQuery = z.object({
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  employeeId: z.string().optional(),
});
export type AdjustmentQuery = z.infer<typeof adjustmentQuery>;

export const payrollSettingsBody = z
  .object({ deductLossOfPay: z.boolean(), recoverAssetsFromSalary: z.boolean() })
  .partial()
  .refine((b) => Object.keys(b).length > 0, { message: 'Send at least one setting to change.' });
export type PayrollSettingsBody = z.infer<typeof payrollSettingsBody>;
