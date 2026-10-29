import type { Currency } from '../exchange/schemas.js';

export type ComponentKind = 'EARNING' | 'DEDUCTION';
export type ComponentCalc = 'FIXED' | 'PERCENT_OF_BASIC';
export type PayrollStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'DISBURSED';
export interface SalaryComponent {
  id: string;
  code: string;
  label: string;
  kind: ComponentKind;
  calc: ComponentCalc;
  value: string;
  sortOrder: number;
  countsAsWages: boolean;
}

export interface SalaryStructure {
  id: string;
  name: string;
  currency: Currency;
  basic: string;
  isActive: boolean;
  components: SalaryComponent[];
  /**
   * How many employees are assigned. The server refuses to delete a structure
   * in use, so this is what lets the control say so before it is pressed.
   */
  employeeCount: number;
}

export interface SalaryStructureInput {
  name: string;
  currency: Currency;
  basic: number;
  isActive?: boolean;
  components: Array<{
    code: string;
    label: string;
    kind: ComponentKind;
    calc: ComponentCalc;
    value: number;
    sortOrder?: number;
    countsAsWages?: boolean;
  }>;
}
export interface PayslipLine {
  code: string;
  label: string;
  calc: ComponentCalc | 'ADJUSTMENT';
  value: string;
  amount: string;
  kind?: ComponentKind;
}

export interface ReimbursementLine {
  claimId: string;
  category: string;
  expenseDate: string;
  spentCurrency: Currency;
  spentAmount: string;
  fxRateToBdt: string;
  amount: string;
}

export interface PayslipBreakdown {
  currency: Currency;
  fxRateToBdt: string;
  earnings: PayslipLine[];
  deductions: PayslipLine[];
  adjustments: PayslipLine[];
  reimbursements: ReimbursementLine[];
  attendance: {
    calendarDays: number;
    workingDays: number;
    present: number;
    absent: number;
    onPaidLeave: number;
    onUnpaidLeave: number;
    lopDays: number;
    payableDays: number;
  };
}

export interface Payslip {
  id: string;
  payslipNo: string;
  payrollRunId: string;
  employeeId: string;
  calendarDays: number;
  lopDays: string;
  payableDays: string;
  currency: Currency;
  basic: string;
  grossFull: string;
  grossPay: string;
  totalDeductions: string;
  netPay: string;
  reimbursements: string;
  netPayable: string;
  fxRateToBdt: string;
  grossPayBdt: string;
  totalDeductionsBdt: string;
  netPayBdt: string;
  netPayableBdt: string;
  breakdown: PayslipBreakdown;
  pdfUrl: string | null;
  emailedAt: string | null;
  emailError: string | null;
  employee?: { id: string; fullName: string; employeeCode: string };
  payrollRun?: { id: string; month: number; year: number; status: PayrollStatus };
}

export interface PayrollRun {
  id: string;
  month: number;
  year: number;
  status: PayrollStatus;
  fxRateToBdt: string | null;
  disbursementFxRateToBdt: string | null;
  processedBy: string | null;
  processedAt: string | null;
  submittedBy: string | null;
  submittedAt: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  disbursedBy: string | null;
  disbursedAt: string | null;
  rejectionNote: string | null;
  notes: string | null;
  createdAt: string;
  payslipCount?: number;
  grossPayBdt?: string;
  totalDeductionsBdt?: string;
  netPayBdt?: string;
  netPayableBdt?: string;
  payslips?: Payslip[];
  /** People left out of this run, chosen before it is submitted. */
  excludedEmployeeIds?: string[];
  excludedEmployees?: { id: string; fullName: string; employeeCode: string }[];
  preflight?: PreflightReport;
}

export type PreflightBlockerCode =
  | 'MONTH_NOT_OVER'
  | 'UNAPPROVED_ATTENDANCE'
  | 'MISSING_SALARY_STRUCTURE'
  | 'MISSING_EXCHANGE_RATE'
  | 'NEGATIVE_NET_PAY';

export interface PreflightBlocker {
  code: PreflightBlockerCode;
  message: string;
  employees: Array<{
    employeeId: string;
    fullName: string;
    employeeCode: string;
    detail: string;
  }>;
}

export interface PreflightReport {
  month: number;
  year: number;
  ok: boolean;
  blockers: PreflightBlocker[];
}

export interface PayrollAdjustment {
  id: string;
  employeeId: string;
  month: number;
  year: number;
  kind: ComponentKind;
  code: string;
  label: string;
  currency: Currency;
  amount: string;
  reason: string;
  createdBy: string;
  createdAt: string;
  payslipId: string | null;
  employee?: { id: string; fullName: string; employeeCode: string };
}

export interface AdjustmentInput {
  employeeId: string;
  month: number;
  year: number;
  kind: ComponentKind;
  code: string;
  label: string;
  currency: Currency;
  amount: number;
  reason: string;
}

export interface BankFileManifest {
  runId: string;
  month: number;
  year: number;
  currency: Currency;
  rows: number;
  totalNative: string;
  totalBdt: string;
  excluded: Array<{ currency: Currency; rows: number }>;
}

export interface BankFileSummary {
  runId: string;
  month: number;
  year: number;
  payslipCount: number;
  totalRows: number;
  /** False means some payslip belongs to no file — somebody would not be paid. */
  complete: boolean;
  currencies: Array<{ currency: Currency; rows: number; totalNative: string; totalBdt: string }>;
}

export interface EmailStatus {
  total: number;
  sent: number;
  failed: number;
  inProgress: boolean;
}
export interface PayrollSettings {
  deductLossOfPay: boolean;
  /** False means a lost or damaged asset is never taken from salary. */
  recoverAssetsFromSalary: boolean;
}
