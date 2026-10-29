import { api } from '@/lib/api-client';
import type {
  CostAttachment, CostBill, CostCategory, CostCommitment, CostImportCommitResult, CostImportPreview, CostSummary, CreateCommitmentInput, CreateCostCategoryInput, CreateCostInput, PayCostInput,
  UpdateCommitmentInput, UpdateCostCategoryInput, UpdateCostInput,
} from './types';

// The screens copied from HR-MNG-V1 thread an access token through every call. The shared client already
// attaches it, so these keep the original's signatures and ignore the first argument.

export interface SignedDocumentUrl {
  url: string;
  expiresAt: string;
}

const query = (params: Record<string, string | number | boolean | undefined>) => {
  const search = new URLSearchParams(Object.entries(params).filter((e): e is [string, string | number | boolean] => e[1] !== undefined && e[1] !== '').map(([k, v]) => [k, String(v)])).toString();
  return search ? `?${search}` : '';
};
const post = <T>(path: string, body?: unknown) => api.request<T>(path, { method: 'POST', body });
const patch = <T>(path: string, body: unknown) => api.request<T>(path, { method: 'PATCH', body });
const sheet = <T>(path: string, file: File) => {
  const body = new FormData();
  body.append('file', file);
  return api.request<T>(path, { method: 'POST', body });
};

export const listCostCategories = (_t: string) => api.request<CostCategory[]>('/costs/categories');
export const createCostCategory = (_t: string, input: CreateCostCategoryInput) => post<CostCategory>('/costs/categories', input);
export const updateCostCategory = (_t: string, id: string, input: UpdateCostCategoryInput) => patch<CostCategory>(`/costs/categories/${id}`, input);
export const deleteCostCategory = (_t: string, id: string) => api.request<void>(`/costs/categories/${id}`, { method: 'DELETE' });

export const listCostCommitments = (_t: string, filter: { active?: boolean } = {}) => api.request<CostCommitment[]>(`/costs/commitments${query({ active: filter.active })}`);
export const createCostCommitment = (_t: string, input: CreateCommitmentInput) => post<CostCommitment>('/costs/commitments', input);
export const updateCostCommitment = (_t: string, id: string, input: UpdateCommitmentInput) => patch<CostCommitment>(`/costs/commitments/${id}`, input);

export const getCostSummary = (_t: string, year: number, month: number) => api.request<CostSummary>(`/costs/summary${query({ year, month })}`);

export const listCosts = (_t: string, filter: { year?: number; month?: number; categoryId?: string; status?: string } = {}) => api.request<CostBill[]>(`/costs${query(filter)}`);
export const getCost = (_t: string, id: string) => api.request<CostBill>(`/costs/${id}`);
export const createCost = (_t: string, input: CreateCostInput) => post<CostBill>('/costs', input);
export const updateCost = (_t: string, id: string, input: UpdateCostInput) => patch<CostBill>(`/costs/${id}`, input);
export const payCost = (_t: string, id: string, input: PayCostInput) => post<CostBill>(`/costs/${id}/pay`, input);

export const uploadCostReceipt = (_t: string, costId: string, file: File) => sheet<CostAttachment>(`/costs/${costId}/receipts`, file);
export const getCostReceiptUrl = (_t: string, id: string) => api.request<SignedDocumentUrl>(`/costs/receipts/${id}/url`);
export const deleteCostReceipt = (_t: string, id: string) => api.request<void>(`/costs/receipts/${id}`, { method: 'DELETE' });

export const previewCostImport = (_t: string, file: File) => sheet<CostImportPreview>('/costs/import/preview', file);
export const commitCostImport = (_t: string, file: File) => sheet<CostImportCommitResult>('/costs/import/commit', file);
