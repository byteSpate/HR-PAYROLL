import type { CostAttachment, CostBill, CostCategory, CostCommitment } from '@erp/contracts/cost';
import type { Prisma } from '@erp/db';
import { formatDateOnly, officeToday } from '@erp/export';
import { isOverdue } from './cost.derive.js';

const day = (d: Date | null) => (d ? formatDateOnly(d) : null);
const iso = (d: Date | null) => (d ? d.toISOString() : null);

export const categoryView = (c: Prisma.CostCategoryGetPayload<object>): CostCategory => ({ id: c.id, code: c.code, name: c.name });

export const commitmentView = (c: Prisma.CostCommitmentGetPayload<{ include: { category: true } }>): CostCommitment => ({
  id: c.id,
  categoryId: c.categoryId,
  category: categoryView(c.category),
  label: c.label,
  payee: c.payee,
  amount: c.amount ? c.amount.toFixed(2) : null,
  currency: c.currency,
  dueDay: c.dueDay,
  startedOn: formatDateOnly(c.startedOn),
  endedOn: day(c.endedOn),
  notes: c.notes,
  createdAt: c.createdAt.toISOString(),
  updatedAt: c.updatedAt.toISOString(),
});

export const attachmentView = (a: Prisma.CostAttachmentGetPayload<object>): CostAttachment => ({
  id: a.id,
  costId: a.costId,
  fileName: a.fileName,
  bytes: a.bytes,
  format: a.format,
  uploadedBy: a.uploadedBy,
  uploadedAt: a.uploadedAt.toISOString(),
});

export type BillRow = Prisma.OperatingCostGetPayload<{ include: { category: true; commitment: { include: { category: true } }; attachments: true } }>;

export const billView = (b: Omit<BillRow, 'attachments'> & { attachments?: BillRow['attachments'] }): CostBill => ({
  id: b.id,
  categoryId: b.categoryId,
  category: categoryView(b.category),
  commitmentId: b.commitmentId,
  commitment: b.commitment ? commitmentView(b.commitment) : null,
  label: b.label,
  payee: b.payee,
  periodMonth: b.periodMonth,
  periodYear: b.periodYear,
  amount: b.amount.toFixed(2),
  currency: b.currency,
  dueDate: day(b.dueDate),
  status: b.status,
  paidAt: iso(b.paidAt),
  paidBy: b.paidBy,
  paymentRef: b.paymentRef,
  notes: b.notes,
  createdBy: b.createdBy,
  createdAt: b.createdAt.toISOString(),
  updatedAt: b.updatedAt.toISOString(),
  isOverdue: isOverdue(b, officeToday()),
  ...(b.attachments ? { attachments: b.attachments.map(attachmentView) } : {}),
});
