// Wire types for the expense screens, written once here and read by the API and the web app.
// Ported from HR-MNG-V1, which mirrored them by hand.
import type { Currency } from '../exchange/schemas.js';
import type { ExpenseStatus } from './schemas.js';

export interface ExpenseCategory {
  id: string;
  code: string;
  name: string;
}

export interface ExpenseClaim {
  id: string;
  employeeId: string;
  name: string;
  /** Both null unless the category carries a route. */
  travelFrom: string | null;
  travelTo: string | null;
  amount: string;
  categoryId: string;
  category: { code: string; name: string };
  description: string | null;
  status: ExpenseStatus;
  expenseDate: string;
  currency: Currency;
  fxRateToBdt: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  payslipId: string | null;
  settlementId: string | null;
  createdAt: string;
  employee?: { id: string; fullName: string; employeeCode: string };
  /** Which payslip paid it. Joined once payroll exists; until then no claim can have one. */
  payslip?: { id: string; payslipNo: string; payrollRunId: string } | null;
}

export interface ExpenseClaimInput {
  /** Required. A category alone cannot tell two claims apart. */
  name: string;
  amount: number;
  categoryId: string;
  currency: Currency;
  expenseDate: string;
  description?: string;
  /** Only travel and conveyance claims carry a route; the server drops these for any other category. */
  travelFrom?: string;
  travelTo?: string;
}

export interface BatchApproveResult {
  approved: string[];
  /** Named, so the screen can say which were left and why. */
  failed: Array<{ id: string; reason: string }>;
}

export interface ExpenseReceipt {
  id: string;
  fileName: string;
  bytes: number;
  format: string;
  uploadedAt: string;
}

export interface ExpenseReportRow {
  id: string;
  employee: { id: string; fullName: string; employeeCode: string };
  name: string;
  category: { code: string; name: string };
  expenseDate: string;
  amount: string;
  currency: string;
  status: ExpenseStatus;
  description: string | null;
  travelFrom: string | null;
  travelTo: string | null;
  /** Zero is the thing an approver looks for. */
  receipts: number;
  paidOn: string | null;
  /** The day the claim was sent. */
  submittedOn: string;
  /** Set when a foreign claim is approved. Null for BDT and for pending claims. */
  fxRateToBdt: string | null;
  amountBdt: string | null;
  reviewedOn: string | null;
  reviewNote: string | null;
}

export interface ExpenseReport {
  from: string;
  to: string;
  /** Present only when the report was narrowed to one person. */
  employee: { id: string; fullName: string; employeeCode: string } | null;
  status: ExpenseStatus | null;
  rows: ExpenseReportRow[];
  totals: {
    claims: number;
    /** Per currency, never added together. */
    byCurrency: { currency: Currency; claims: number; amount: string }[];
    byStatus: { status: ExpenseStatus; claims: number; byCurrency: { currency: Currency; amount: string }[] }[];
  };
}

export interface OutstandingExpenseReimbursementRow {
  id: string;
  employee: { id: string; fullName: string; employeeCode: string };
  name: string;
  category: { code: string; name: string };
  approvedAt: string | null;
  ageDays: number | null;
  amount: string;
  currency: Currency;
}

export interface OutstandingExpenseReimbursements {
  rows: OutstandingExpenseReimbursementRow[];
  totals: { claims: number; byCurrency: { currency: Currency; claims: number; amount: string }[] };
}
