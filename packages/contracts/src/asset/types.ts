// Wire types for the asset screens, written once here and read by the API and the web app.
// Ported from HR-MNG-V1, which mirrored them by hand. Money is a string everywhere.
import type { Currency } from '../exchange/schemas.js';
import type {
  assetAttachmentKinds,
  assetClassifications,
  assetComputedStatuses,
  assetConditions,
  assetLifecycles,
  assetRecoveryKinds,
  assetRecoveryStatuses,
  assetRequestKinds,
  assetRequestStatuses,
} from './schemas.js';

export type AssetComputedStatus = (typeof assetComputedStatuses)[number];
export type AssetCondition = (typeof assetConditions)[number];
export type AssetLifecycle = (typeof assetLifecycles)[number];
export type AssetClassification = (typeof assetClassifications)[number];
export type AssetAttachmentKind = (typeof assetAttachmentKinds)[number];
export type AssetRequestKind = (typeof assetRequestKinds)[number];
export type AssetRequestStatus = (typeof assetRequestStatuses)[number];
export type AssetRecoveryKind = (typeof assetRecoveryKinds)[number];
export type AssetRecoveryStatus = (typeof assetRecoveryStatuses)[number];
export type AssetRequestStage =
  | 'AWAITING_APPROVAL'
  | 'APPROVED'
  | 'ORDERED'
  | 'IN_REPAIR'
  | 'AWAITING_COLLECTION'
  | 'DONE'
  | 'REJECTED'
  | 'CANCELLED';

export interface AssetRequestTimelineEntry {
  action: string;
  at: string;
  byUserId: string | null;
  note: string | null;
}

export interface AssetHeldBy {
  assignmentId: string;
  employeeId: string;
  employeeCode: string;
  fullName: string;
  assignedAt: string;
  conditionOut: AssetCondition;
  acknowledgedAt: string | null;
}

export interface AssetCategory {
  id: string;
  code: string;
  name: string;
  requiresSerial: boolean;
  isConsumable: boolean;
  classification: AssetClassification;
  tracksIndividually: boolean;
  usefulLifeMonths: number | null;
}

export interface Asset {
  id: string;
  assetTag: string;
  name: string;
  categoryId: string;
  category: { id: string; code: string; name: string };
  serialNumber: string | null;
  model: string | null;
  status: AssetComputedStatus;
  heldBy: AssetHeldBy | null;
  location: string | null;
  /** The owning cost centre, not the holder's. */
  departmentId: string | null;
  currency: Currency;
  warrantyExpiry: string | null;
  /** Null until it is capitalised. A state, unlike the absent cost, which is a permission. */
  capitalisedAt: string | null;
  capitalisedBy: string | null;
  /** The four below are absent, not null, for a viewer who may not see costs: the server omits them. */
  purchaseCost?: string;
  vendor?: string;
  /** Frozen at capitalisation; null until then. */
  fxRateToBdt?: string | null;
  purchaseCostBdt?: string | null;
  /** True once the purchase has been paid for. */
  paid?: boolean;
}

export interface AssetAssignment {
  id: string;
  assetId: string;
  employeeId: string;
  assignedAt: string;
  assignedBy: string;
  conditionOut: AssetCondition;
  issueNote: string | null;
  acknowledgedAt: string | null;
  returnedAt: string | null;
  returnedTo: string | null;
  conditionIn: AssetCondition | null;
  returnNote: string | null;
  asset?: { id: string; assetTag: string; name: string; category: { id: string; name: string } };
  employee?: { id: string; fullName: string; employeeCode: string };
}

export interface AssetRequest {
  id: string;
  employeeId: string;
  kind: AssetRequestKind;
  categoryId: string | null;
  assetId: string | null;
  quantity: number | null;
  reason: string;
  status: AssetRequestStatus;
  stage: AssetRequestStage;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  expectedBy: string | null;
  orderNote: string | null;
  fulfilledAt: string | null;
  fulfilledBy: string | null;
  fulfilledAssetId: string | null;
  fulfilledNote: string | null;
  createdAt: string;
  category?: { id: string; name: string };
  employee?: { id: string; fullName: string; employeeCode: string };
}

export interface AssetRepair {
  id: string;
  assetId: string;
  sentAt: string;
  sentBy: string;
  vendor: string | null;
  fault: string;
  expectedBack: string | null;
  isWarranty: boolean;
  returnedAt: string | null;
  cost: string | null;
  currency: Currency;
  outcome: string | null;
  conditionAfter: AssetCondition | null;
  asset?: { id: string; assetTag: string; name: string; category: { id: string; name: string } };
}

export interface AssetAttachment {
  id: string;
  assetId: string | null;
  assignmentId: string | null;
  kind: AssetAttachmentKind;
  fileName: string;
  bytes: number;
  format: string;
  uploadedBy: string | null;
  uploadedAt: string;
}

/** What one asset's read returns: the row plus the history its detail sheet is built from. */
export interface AssetDetail extends Asset {
  notes: string | null;
  purchaseDate: string | null;
  department: { id: string; name: string } | null;
  retiredAt: string | null;
  retirementNote: string | null;
  assignments: AssetAssignment[];
  repairs: AssetRepair[];
  attachments: AssetAttachment[];
}

export interface AssetRecovery {
  id: string;
  assetId: string;
  employeeId: string;
  assignmentId: string | null;
  kind: AssetRecoveryKind;
  amount: string;
  currency: Currency;
  reason: string;
  status: AssetRecoveryStatus;
  waivedBy: string | null;
  waivedAt: string | null;
  waiverReason: string | null;
  adjustmentId: string | null;
  settlementId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  asset?: { assetTag: string; name: string; category?: { name: string } };
  /** Joined once payroll exists; until then no recovery can have been collected. */
  adjustment?: { payslip?: { payslipNo: string } | null } | null;
  settlement?: { settlementNo: string } | null;
}

export interface ExitChecklistOpenAssignment {
  assignmentId: string;
  assetId: string;
  assetTag: string;
  assetName: string;
  categoryName: string;
  assignedAt: string;
  conditionOut: string;
  acknowledgedAt: string | null;
}

export interface ExitChecklist {
  employeeId: string;
  openAssignments: ExitChecklistOpenAssignment[];
  pendingRecoveries: AssetRecovery[];
  /** Informational. It never gates anything. */
  hasOutstanding: boolean;
}

export interface AssetImportIssue {
  rowNumber: number;
  column: string | null;
  message: string;
}

export interface AssetImportPreview {
  rows: unknown[];
  issues: AssetImportIssue[];
  summary: Record<string, number>;
}

export interface AssetImportCommitResult {
  assetCount: number;
  assignmentCount: number;
}
