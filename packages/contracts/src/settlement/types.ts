import type { Currency } from '../exchange/schemas.js';
import type { ExitReason } from '../employee/types.js';

export type SettlementStatus = 'DRAFT' | 'APPROVED' | 'PAID';
export interface SettlementBreakdown {
  currency: Currency;
  fxRateToBdt: string;
  exitReason: ExitReason;
  exitLabel: string;
  lastWorkingDay: string;
  serviceYears: string;
  completedYears: number;
  pendingSalary: {
    calendarDays: number;
    daysEmployed: number;
    payableDays: string;
    grossPay: string;
    totalDeductions: string;
    netPay: string;
  };
  /** Carries its own working, so a disputed figure can be explained. */
  gratuity: {
    eligible: boolean;
    wagesBase: string;
    daysPerYear: number;
    completedYears: number;
    amount: string;
    reason: string;
  };
  notice: { days: number; amount: string; reason: string };
  claims: Array<{
    claimId: string;
    category: string;
    spentCurrency: Currency;
    spentAmount: string;
    fxRateToBdt: string;
  }>;
}

export interface Settlement {
  id: string;
  settlementNo: string;
  employeeId: string;
  status: SettlementStatus;
  lastWorkingDay: string;
  exitReason: ExitReason;
  serviceYears: string;
  currency: Currency;
  fxRateToBdt: string;
  pendingSalary: string;
  gratuity: string;
  noticePay: string;
  expenseReimbursement: string;
  leaveEncashment: string;
  outstandingDeductions: string;
  assetRecoveries: string;
  finalAmount: string;
  finalAmountBdt: string;
  breakdown: SettlementBreakdown;
  calculatedBy: string | null;
  calculatedAt: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  paidBy: string | null;
  paidAt: string | null;
  rejectionNote: string | null;
  generatedAt: string;
  employee?: { id: string; fullName: string; employeeCode: string; joiningDate: string };
  claims?: Array<{ id: string; category: string; amount: string; currency: Currency }>;
}

export interface ExitDetailsInput {
  lastWorkingDay: string;
  exitReason: ExitReason;
  exitNote?: string;
}

export interface SettlementOverrideInput {
  pendingSalary?: number;
  gratuity?: number;
  noticePay?: number;
  expenseReimbursement?: number;
  outstandingDeductions?: number;
  assetRecoveries?: number;
  reason: string;
}

/** Company-wide payroll rules. False means absent days and unpaid leave never lower pay. */
