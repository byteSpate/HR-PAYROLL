import type { BatchApproveResult, ExpenseCategory, ExpenseClaim, ExpenseClaimInput, ExpenseReceipt, ExpenseReport, ExpenseStatus, OutstandingExpenseReimbursements, UpdateClaimBody } from '@erp/contracts/expense';
import { api } from '@/lib/api-client';

// The screens copied from HR-MNG-V1 thread an access token through every call. The shared client already
// attaches it, so these keep the original's signatures and ignore the first argument. HR-MNG-V1 decides
// with PATCH; this API uses POST.

export type { BatchApproveResult };

export type ExpenseClaimUpdate = UpdateClaimBody;

export interface ExpenseReportQuery {
  from: string;
  to: string;
  employeeId?: string;
  status?: ExpenseStatus;
}

const query = (params: Record<string, string | undefined>) => {
  const search = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => !!e[1])).toString();
  return search ? `?${search}` : '';
};

export const listExpenseCategories = (_accessToken: string) => api.request<ExpenseCategory[]>('/expenses/categories');

export const createExpenseClaim = (_accessToken: string, input: ExpenseClaimInput) => api.request<ExpenseClaim>('/expenses', { method: 'POST', body: input });

export const getMyExpenseClaims = (_accessToken: string) => api.request<ExpenseClaim[]>('/expenses/me');

export const listExpenseClaims = (_accessToken: string, filter: { status?: ExpenseStatus; employeeId?: string } = {}) =>
  api.request<ExpenseClaim[]>(`/expenses${query(filter)}`);

export const approveExpenseClaim = (_accessToken: string, id: string, note?: string) => api.request<ExpenseClaim>(`/expenses/${id}/approve`, { method: 'POST', body: { note } });

export const batchApproveExpenseClaims = (_accessToken: string, claimIds: string[]) => api.request<BatchApproveResult>('/expenses/batch-approve', { method: 'POST', body: { claimIds } });

export const rejectExpenseClaim = (_accessToken: string, id: string, note: string) => api.request<ExpenseClaim>(`/expenses/${id}/reject`, { method: 'POST', body: { note } });

export const updateExpenseClaim = (_accessToken: string, id: string, body: ExpenseClaimUpdate) => api.request<ExpenseClaim>(`/expenses/${id}`, { method: 'PATCH', body });

export const deleteExpenseClaim = (_accessToken: string, id: string) => api.request<void>(`/expenses/${id}`, { method: 'DELETE' });

/** Uploaded after the claim exists, never before: the server checks ownership against the claim. */
export const uploadClaimReceipt = (_accessToken: string, claimId: string, file: File) => {
  const body = new FormData();
  body.append('file', file);
  return api.request<ExpenseReceipt>(`/expenses/${claimId}/receipts`, { method: 'POST', body });
};

export const listClaimReceipts = (_accessToken: string, claimId: string) => api.request<ExpenseReceipt[]>(`/expenses/${claimId}/receipts`);

/** Signed and short-lived: fetch it when the person clicks, never store it. */
export const getClaimReceiptUrl = (_accessToken: string, receiptId: string) => api.request<{ url: string; expiresAt: string }>(`/expenses/receipts/${receiptId}/url`);

export const deleteClaimReceipt = (_accessToken: string, receiptId: string) => api.request<void>(`/expenses/receipts/${receiptId}`, { method: 'DELETE' });

export const getExpenseReport = (_accessToken: string, filter: ExpenseReportQuery) => api.request<ExpenseReport>(`/expenses/report${query({ ...filter })}`);

export const getOutstandingExpenseReimbursements = (_accessToken: string) => api.request<OutstandingExpenseReimbursements>('/expenses/outstanding-reimbursements');

/** The same report as a file. The server builds both, so a download cannot carry a figure the screen does not show. */
export async function downloadExpenseReport(_accessToken: string, filter: ExpenseReportQuery, format: 'csv' | 'pdf' = 'pdf'): Promise<Blob> {
  return (await api.download(`/expenses/report${query({ ...filter, format })}`)).blob;
}
