// Wire types for the operating-cost screens. Money is a string everywhere; `isOverdue` is derived on every read.
import type { Currency } from '../exchange/schemas.js';
import type { costStatuses } from './schemas.js';

export type CostStatus = (typeof costStatuses)[number];

export interface CostCategory {
  id: string;
  code: string;
  name: string;
}

export interface CostCommitment {
  id: string;
  categoryId: string;
  category?: CostCategory;
  label: string;
  payee: string;
  amount: string | null;
  currency: Currency;
  dueDay: number | null;
  startedOn: string;
  endedOn: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CostAttachment {
  id: string;
  costId: string;
  fileName: string;
  bytes: number;
  format: string;
  uploadedBy: string | null;
  uploadedAt: string;
}

export interface CostBill {
  id: string;
  categoryId: string;
  category: CostCategory;
  commitmentId: string | null;
  commitment: CostCommitment | null;
  label: string;
  payee: string;
  periodMonth: number;
  periodYear: number;
  amount: string;
  currency: Currency;
  dueDate: string | null;
  status: CostStatus;
  paidAt: string | null;
  paidBy: string | null;
  paymentRef: string | null;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  isOverdue: boolean;
  attachments?: CostAttachment[];
}

export interface CostCategoryTotal {
  categoryId: string;
  categoryName: string;
  currency: Currency;
  total: string;
  paid: string;
  outstanding: string;
  billCount: number;
}

export interface CostCurrencyTotal {
  currency: Currency;
  total: string;
  paid: string;
  outstanding: string;
}

export interface CostSummary {
  categories: CostCategoryTotal[];
  totals: CostCurrencyTotal[];
  overdueCount: number;
}

export interface CostImportPreview {
  rows: unknown[];
  issues: { rowNumber: number; column: string | null; message: string }[];
  summary: Record<string, number>;
}

export interface CostImportCommitResult {
  costCount: number;
  paidCount: number;
}
