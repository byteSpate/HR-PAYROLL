import type { CreateEmployeeInput, EmployeeView } from '@erp/contracts/employee';
import { api } from '@/lib/api-client';

export interface DocumentItem {
  id: string;
  type: string;
  fileName: string;
  bytes: number;
  format: string;
  uploadedAt: string;
}

export interface ChangeRequestView {
  id: string;
  employee: { id: string; fullName: string; employeeCode: string };
  oldValue: string | null;
  newValue: string;
  status: string;
  createdAt: string;
  decidedAt: string | null;
  decisionNote: string | null;
}

const query = (params: Record<string, string | undefined>) => {
  const q = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => !!e[1])).toString();
  return q ? `?${q}` : '';
};
const fileForm = (file: File, extra: Record<string, string> = {}) => {
  const form = new FormData();
  for (const [k, v] of Object.entries(extra)) form.append(k, v);
  form.append('file', file);
  return form;
};

export const listEmployees = (q?: string) => api.request<EmployeeView[]>(`/employees${query({ q })}`);
export const directory = (q?: string, departmentId?: string) =>
  api.request<EmployeeView[]>(`/employees/directory${query({ q, departmentId })}`);
export const myTeam = () => api.request<EmployeeView[]>('/employees/team');
export const getMe = () => api.request<EmployeeView>('/employees/me');
export const getEmployee = (id: string) => api.request<EmployeeView>(`/employees/${id}`);
export const createEmployee = (body: CreateEmployeeInput) =>
  api.request<{ employee: EmployeeView; temporaryPassword: string }>('/employees', { method: 'POST', body });
export const updateEmployee = (id: string, body: Record<string, unknown>) =>
  api.request<EmployeeView>(`/employees/${id}`, { method: 'PATCH', body });
export const recordExit = (id: string, body: { lastWorkingDay: string; exitReason: string; exitNote?: string }) =>
  api.request<EmployeeView>(`/employees/${id}/exit`, { method: 'PATCH', body });
export const setAccount = (id: string, isActive: boolean) =>
  api.request<EmployeeView>(`/employees/${id}/account`, { method: 'PATCH', body: { isActive } });
export const exportEmployees = (format: 'xlsx' | 'csv') => api.download(`/employees/export?format=${format}`);

export const listDocuments = (id: string) => api.request<DocumentItem[]>(`/employees/${id}/documents`);
export const uploadDocument = (id: string, type: string, file: File) =>
  api.request<DocumentItem>(`/employees/${id}/documents`, { method: 'POST', body: fileForm(file, { type }) });
export const documentUrl = (id: string, docId: string) =>
  api.request<{ url: string }>(`/employees/${id}/documents/${docId}/url`);
export const deleteDocument = (id: string, docId: string) =>
  api.request<void>(`/employees/${id}/documents/${docId}`, { method: 'DELETE' });
export const setAvatar = (id: string, file: File) =>
  api.request<EmployeeView>(`/employees/${id}/avatar`, { method: 'PATCH', body: fileForm(file) });

export const listIdRequests = (status?: string) =>
  api.request<ChangeRequestView[]>(`/employees/national-id-requests${query({ status })}`);
export const requestIdChange = (newValue: string) =>
  api.request<ChangeRequestView>('/employees/national-id-requests', { method: 'POST', body: { newValue } });
export const decideIdRequest = (id: string, approve: boolean, note?: string) =>
  api.request<ChangeRequestView>(`/employees/national-id-requests/${id}/decide`, { method: 'PATCH', body: { approve, note } });
