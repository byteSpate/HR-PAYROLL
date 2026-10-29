import { z } from 'zod';
import { nonNegativeDecimal } from '../decimal.js';
import { currencies } from '../exchange/schemas.js';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a YYYY-MM-DD date');

export const assetConditions = ['NEW', 'GOOD', 'FAIR', 'DAMAGED'] as const;
export const assetLifecycles = ['IN_SERVICE', 'LOST', 'RETIRED'] as const;
export const assetComputedStatuses = [
  'AVAILABLE',
  'ASSIGNED',
  'IN_REPAIR',
  'LOST',
  'RETIRED',
] as const;
export const assetClassifications = ['IT', 'NON_IT'] as const;
export const assetAttachmentKinds = [
  'PHOTO',
  'INVOICE',
  'WARRANTY',
  'CONDITION_OUT',
  'CONDITION_IN',
] as const;
export const assetRequestKinds = ['NEW_ITEM', 'REPAIR', 'RETURN'] as const;
export const assetRequestStatuses = [
  'PENDING',
  'APPROVED',
  'ORDERED',
  'REJECTED',
  'CANCELLED',
  'FULFILLED',
] as const;
export const assetRecoveryKinds = ['NOT_RETURNED', 'DAMAGED', 'LOST'] as const;
export const assetRecoveryStatuses = ['PENDING', 'RECOVERED', 'WAIVED'] as const;

/** Asset.purchaseCost and AssetRecovery.amount are Decimal(14,2). */
const assetMoney = (label: string) => nonNegativeDecimal(label, 12, 2);

export const createAssetBody = z.object({
  categoryId: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  assetTag: z.string().trim().min(1).max(50).optional(),
  serialNumber: z.string().trim().min(1).max(100).optional(),
  model: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(2000).optional(),
  purchaseDate: isoDate.optional(),
  purchaseCost: assetMoney('purchaseCost').optional(),
  currency: z.enum(currencies).optional(),
  vendor: z.string().trim().max(200).optional(),
  warrantyExpiry: isoDate.optional(),
  departmentId: z.string().uuid().optional(),
  location: z.string().trim().max(200).optional(),
});
export type CreateAssetBody = z.infer<typeof createAssetBody>;

export const updateAssetBody = createAssetBody.partial();
export type UpdateAssetBody = z.infer<typeof updateAssetBody>;

/** A recovery offered where the facts are fresh: on marking an asset lost, or returning it damaged. */
const inlineRecovery = z.object({
  amount: assetMoney('amount'),
  currency: z.enum(currencies).optional(),
  reason: z.string().trim().min(1, 'A reason is required').max(1000),
  kind: z.enum(assetRecoveryKinds).optional(),
});

/** A note is required: retiring is a write-off and marking lost is an accusation, so neither goes without a sentence saying why. */
export const lifecycleBody = z.object({
  note: z.string().trim().min(1, 'A note is required').max(1000),
  recovery: inlineRecovery.optional(),
});
export type LifecycleBody = z.infer<typeof lifecycleBody>;

export const categoryBody = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[A-Z_]+$/, 'Use upper-case letters and underscores')
    .max(40),
  name: z.string().trim().min(1).max(100),
  requiresSerial: z.boolean().optional(),
  isConsumable: z.boolean().optional(),
  usefulLifeMonths: z.coerce.number().int().min(1).nullable().optional(),
  // Required, not defaulted: a category nobody classified is the silent bucket the non-null column exists to prevent.
  classification: z.enum(assetClassifications),
  tracksIndividually: z.boolean().optional(),
  // Percent a year of the book value at the start of the financial year; blank means the category is not depreciated.
  depreciationRate: z
    .string()
    .trim()
    .regex(
      /^(100(\.0{1,2})?|\d{1,2}(\.\d{1,2})?)$/,
      'Use a percentage from 0 to 100 with at most two decimals',
    )
    .nullable()
    .optional(),
});
export type CategoryBody = z.infer<typeof categoryBody>;

export const updateCategoryBody = categoryBody.partial().omit({ code: true });
export type UpdateCategoryBody = z.infer<typeof updateCategoryBody>;

export const listAssetsQuery = z.object({
  status: z.enum(assetComputedStatuses).optional(),
  categoryId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
  q: z.string().trim().max(100).optional(),
});
export type ListAssetsQuery = z.infer<typeof listAssetsQuery>;

export const assignBody = z.object({
  employeeId: z.string().uuid(),
  conditionOut: z.enum(assetConditions),
  issueNote: z.string().trim().max(1000).optional(),
});
export type AssignBody = z.infer<typeof assignBody>;

export const returnBody = z.object({
  conditionIn: z.enum(assetConditions),
  returnNote: z.string().trim().max(1000).optional(),
  recovery: inlineRecovery.optional(),
});
export type ReturnBody = z.infer<typeof returnBody>;

export const sendRepairBody = z.object({
  fault: z.string().trim().min(1).max(1000),
  vendor: z.string().trim().max(200).optional(),
  expectedBack: isoDate.optional(),
  isWarranty: z.boolean().optional(),
});
export type SendRepairBody = z.infer<typeof sendRepairBody>;

export const receiveRepairBody = z.object({
  cost: assetMoney('cost').optional(),
  currency: z.enum(currencies).optional(),
  outcome: z.string().trim().max(1000).optional(),
  conditionAfter: z.enum(assetConditions).optional(),
});
export type ReceiveRepairBody = z.infer<typeof receiveRepairBody>;

export const repairQuery = z.object({ open: z.enum(['true', 'false']).optional() });

/** A union rather than one wide object, so the invalid combinations cannot be written at the edge. */
export const submitRequestBody = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('NEW_ITEM'),
    categoryId: z.string().uuid(),
    quantity: z.coerce.number().int().min(1).optional(),
    reason: z.string().trim().min(1).max(1000),
  }),
  z.object({
    kind: z.enum(['REPAIR', 'RETURN']),
    assetId: z.string().uuid(),
    reason: z.string().trim().min(1).max(1000),
  }),
]);
export type SubmitRequestBody = z.infer<typeof submitRequestBody>;

export const approveRequestBody = z.object({ note: z.string().trim().max(1000).optional() });
export const rejectRequestBody = z.object({
  note: z.string().trim().min(1, 'A note is required').max(1000),
});
/** assetId is absent for a supply, which has no asset to name; the category decides which applies. */
export const fulfilRequestBody = z.object({
  assetId: z.string().uuid().optional(),
  note: z.string().trim().max(1000).optional(),
});
export const markOrderedBody = z.object({
  expectedBy: isoDate.optional(),
  note: z.string().trim().max(1000).optional(),
});
/** Optional here and required in the service when the canceller is not the requester: the rule depends on who asks. */
export const cancelRequestBody = z.object({ note: z.string().trim().max(1000).optional() });

export const attachmentKindBody = z.enum(assetAttachmentKinds);

export const payAssetBody = z.object({ paidAt: isoDate.optional() });
export const disposeAssetBody = z.object({
  proceeds: assetMoney('proceeds').optional(),
  note: z.string().trim().max(1000).optional(),
});

export const createRecoveryBody = z.object({
  assetId: z.string().uuid(),
  employeeId: z.string().uuid(),
  assignmentId: z.string().uuid().optional(),
  kind: z.enum(assetRecoveryKinds).optional(),
  amount: assetMoney('amount'),
  currency: z.enum(currencies).optional(),
  reason: z.string().trim().min(1, 'A reason is required').max(1000),
});
export type CreateRecoveryBody = z.infer<typeof createRecoveryBody>;

export const updateRecoveryBody = z
  .object({
    amount: assetMoney('amount').optional(),
    currency: z.enum(currencies).optional(),
    reason: z.string().trim().min(1, 'A reason is required').max(1000).optional(),
  })
  .refine((body) => Object.keys(body).length > 0, 'Nothing to update');
export type UpdateRecoveryBody = z.infer<typeof updateRecoveryBody>;

export const waiveRecoveryBody = z.object({
  waiverReason: z.string().trim().min(1, 'A waiver reason is required').max(1000),
});
export type WaiveRecoveryBody = z.infer<typeof waiveRecoveryBody>;

export const recoveryQuery = z.object({
  employeeId: z.string().uuid().optional(),
  assetId: z.string().uuid().optional(),
  status: z.enum(assetRecoveryStatuses).optional(),
});
export type RecoveryQuery = z.infer<typeof recoveryQuery>;

export const draftRunBody = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
});
export const runQuery = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  status: z.enum(['DRAFT', 'POSTED', 'REVERSED']).optional(),
});
export const preflightQuery = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});
export const reverseRunBody = z.object({
  reason: z.string().trim().min(1, 'Give a reason for the reversal').max(1000),
});
export const valueReportQuery = z.object({
  asOf: isoDate.optional(),
  categoryId: z.string().uuid().optional(),
});
