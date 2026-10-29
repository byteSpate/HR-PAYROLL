import type {
  Asset,
  AssetAssignment,
  AssetAttachment,
  AssetCategory,
  AssetRecovery,
  AssetRepair,
  AssetRequest,
} from '@erp/contracts/asset';
import type { Prisma } from '@erp/db';
import { formatDateOnly } from '@erp/export';
import { computeAssetStatus } from './asset.status.js';
import { computeRequestStage } from './asset.stage.js';
import type { HeldBy } from './asset.types.js';

type Money = { toFixed(places: number): string };
export const iso = (date: Date | null): string | null => (date ? date.toISOString() : null);
export const day = (date: Date | null): string | null => (date ? formatDateOnly(date) : null);
export const money = (value: Money | null): string | null => (value ? value.toFixed(2) : null);

export const categoryView = (c: Prisma.AssetCategoryGetPayload<object>): AssetCategory => ({
  id: c.id,
  code: c.code,
  name: c.name,
  requiresSerial: c.requiresSerial,
  isConsumable: c.isConsumable,
  classification: c.classification,
  tracksIndividually: c.tracksIndividually,
  usefulLifeMonths: c.usefulLifeMonths,
});

type OpenAssignmentRow = {
  id: string;
  employeeId: string;
  assignedAt: Date;
  conditionOut: HeldBy['conditionOut'];
  acknowledgedAt: Date | null;
  employee: { employeeCode: string; fullName: string };
};

export const heldByFrom = (a: OpenAssignmentRow): HeldBy => ({
  assignmentId: a.id,
  employeeId: a.employeeId,
  employeeCode: a.employee.employeeCode,
  fullName: a.employee.fullName,
  assignedAt: a.assignedAt,
  conditionOut: a.conditionOut,
  acknowledgedAt: a.acknowledgedAt,
});

const heldByView = (h: HeldBy | null): Asset['heldBy'] =>
  h
    ? { ...h, assignedAt: h.assignedAt.toISOString(), acknowledgedAt: iso(h.acknowledgedAt) }
    : null;

export type AssetRow = Prisma.AssetGetPayload<{ include: { category: true } }>;

export interface AssetViewInput {
  asset: AssetRow;
  openAssignment: OpenAssignmentRow | null;
  hasOpenRepair: boolean;
  /** Whether the viewer may see cost, vendor and the frozen BDT figures. The fields are left out, not blanked. */
  costs: boolean;
}

export function assetView({ asset, openAssignment, hasOpenRepair, costs }: AssetViewInput): Asset {
  const { status, heldBy } = computeAssetStatus({
    lifecycle: asset.lifecycle,
    openAssignment: openAssignment ? heldByFrom(openAssignment) : null,
    hasOpenRepair,
  });
  return {
    id: asset.id,
    assetTag: asset.assetTag,
    name: asset.name,
    categoryId: asset.categoryId,
    category: { id: asset.category.id, code: asset.category.code, name: asset.category.name },
    serialNumber: asset.serialNumber,
    model: asset.model,
    status,
    heldBy: heldByView(heldBy),
    location: asset.location,
    departmentId: asset.departmentId,
    currency: asset.currency,
    warrantyExpiry: day(asset.warrantyExpiry),
    capitalisedAt: iso(asset.capitalisedAt),
    capitalisedBy: asset.capitalisedBy,
    ...(costs
      ? {
          purchaseCost: asset.purchaseCost ? asset.purchaseCost.toFixed(2) : undefined,
          vendor: asset.vendor ?? undefined,
          fxRateToBdt: asset.fxRateToBdt ? asset.fxRateToBdt.toFixed(6) : null,
          purchaseCostBdt: money(asset.purchaseCostBdt),
          paid: asset.paidAt !== null,
        }
      : {}),
  };
}

export const assignmentView = (a: Prisma.AssetAssignmentGetPayload<object>): AssetAssignment => ({
  id: a.id,
  assetId: a.assetId,
  employeeId: a.employeeId,
  assignedAt: a.assignedAt.toISOString(),
  assignedBy: a.assignedBy,
  conditionOut: a.conditionOut,
  issueNote: a.issueNote,
  acknowledgedAt: iso(a.acknowledgedAt),
  returnedAt: iso(a.returnedAt),
  returnedTo: a.returnedTo,
  conditionIn: a.conditionIn,
  returnNote: a.returnNote,
});

type AssignmentWith = Prisma.AssetAssignmentGetPayload<{
  include: {
    asset: { include: { category: true } };
    employee: { select: { id: true; fullName: true; employeeCode: true } };
  };
}>;

export const assignmentWithView = (
  a: Partial<Pick<AssignmentWith, 'asset' | 'employee'>> & Prisma.AssetAssignmentGetPayload<object>,
): AssetAssignment => ({
  ...assignmentView(a),
  ...(a.asset
    ? {
        asset: {
          id: a.asset.id,
          assetTag: a.asset.assetTag,
          name: a.asset.name,
          category: { id: a.asset.category.id, name: a.asset.category.name },
        },
      }
    : {}),
  ...(a.employee ? { employee: a.employee } : {}),
});

export const repairView = (
  r: Prisma.AssetRepairGetPayload<object> & { asset?: AssetRow },
  costs: boolean,
): AssetRepair => ({
  id: r.id,
  assetId: r.assetId,
  sentAt: r.sentAt.toISOString(),
  sentBy: r.sentBy,
  vendor: costs ? r.vendor : null,
  fault: r.fault,
  expectedBack: day(r.expectedBack),
  isWarranty: r.isWarranty,
  returnedAt: iso(r.returnedAt),
  cost: costs ? money(r.cost) : null,
  currency: r.currency,
  outcome: r.outcome,
  conditionAfter: r.conditionAfter,
  ...(r.asset
    ? {
        asset: {
          id: r.asset.id,
          assetTag: r.asset.assetTag,
          name: r.asset.name,
          category: { id: r.asset.category.id, name: r.asset.category.name },
        },
      }
    : {}),
});

export const attachmentView = (a: Prisma.AssetAttachmentGetPayload<object>): AssetAttachment => ({
  id: a.id,
  assetId: a.assetId,
  assignmentId: a.assignmentId,
  kind: a.kind,
  fileName: a.fileName,
  bytes: a.bytes,
  format: a.format,
  uploadedBy: a.uploadedBy,
  uploadedAt: a.uploadedAt.toISOString(),
});

type RecoveryRow = Prisma.AssetRecoveryGetPayload<object> & {
  asset?: { assetTag: string; name: string; category?: { name: string } } | null;
};

export const recoveryView = (r: RecoveryRow): AssetRecovery => ({
  id: r.id,
  assetId: r.assetId,
  employeeId: r.employeeId,
  assignmentId: r.assignmentId,
  kind: r.kind,
  amount: r.amount.toFixed(2),
  currency: r.currency,
  reason: r.reason,
  status: r.status,
  waivedBy: r.waivedBy,
  waivedAt: iso(r.waivedAt),
  waiverReason: r.waiverReason,
  adjustmentId: r.adjustmentId,
  settlementId: r.settlementId,
  createdBy: r.createdBy,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
  ...(r.asset ? { asset: r.asset } : {}),
});

type RequestRow = Prisma.AssetRequestGetPayload<object> & {
  category?: { id: string; name: string } | null;
  employee?: { id: string; fullName: string; employeeCode: string };
  repair?: { returnedAt: Date | null } | null;
};

export const requestView = (r: RequestRow): AssetRequest => ({
  id: r.id,
  employeeId: r.employeeId,
  kind: r.kind,
  categoryId: r.categoryId,
  assetId: r.assetId,
  quantity: r.quantity,
  reason: r.reason,
  status: r.status,
  stage: computeRequestStage({
    kind: r.kind,
    status: r.status,
    repairReturnedAt: r.repair?.returnedAt ?? null,
  }),
  decidedBy: r.decidedBy,
  decidedAt: iso(r.decidedAt),
  decisionNote: r.decisionNote,
  expectedBy: day(r.expectedBy),
  orderNote: r.orderNote,
  fulfilledAt: iso(r.fulfilledAt),
  fulfilledBy: r.fulfilledBy,
  fulfilledAssetId: r.fulfilledAssetId,
  fulfilledNote: r.fulfilledNote,
  createdAt: r.createdAt.toISOString(),
  ...(r.category ? { category: { id: r.category.id, name: r.category.name } } : {}),
  ...(r.employee ? { employee: r.employee } : {}),
});
