import type { Tone } from '@erp/ui/dashboard';
import type { ExpenseStatus } from './types';

export const EXPENSE_STATUS_TONE: Record<ExpenseStatus, Tone> = {
  PENDING: 'yellow',
  APPROVED: 'green',
  REJECTED: 'red',
  REIMBURSED: 'green',
};

export const EXPENSE_STATUS_LABEL: Record<ExpenseStatus, string> = {
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  REIMBURSED: 'Reimbursed',
};
