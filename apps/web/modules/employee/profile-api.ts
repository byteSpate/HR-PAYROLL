import { ApiError } from '@erp/utils';
import type { AccountView } from '@erp/contracts/core';
import type { DocumentItem, DocumentType, EmployeeView, SignedDocumentUrl, UpdateEmployeeInput } from '@erp/contracts/employee';
import { api } from '@/lib/api-client';
import { getAccount } from '@/modules/settings/api';
import type { MyProfileResponse } from './types';

// The screens copied from HR-MNG-V1 thread an access token through every call. The shared client
// already attaches it, so these keep HR's signatures and ignore the first argument.

const form = (file: File, extra: Record<string, string> = {}) => {
  const body = new FormData();
  for (const [key, value] of Object.entries(extra)) body.append(key, value);
  body.append('file', file);
  return body;
};

const none = (error: unknown) => {
  if (error instanceof ApiError && error.status === 404) return null;
  throw error;
};

export async function getMyProfile(_accessToken: string): Promise<MyProfileResponse> {
  const [account, employee]: [AccountView, EmployeeView | null] = await Promise.all([
    getAccount(),
    api.request<EmployeeView>('/employees/me').catch(none),
  ]);
  return { account, employee };
}

/** HR's staff directory, which every signed-in person may read: it carries work identity only. */
export const listEmployees = (_accessToken: string) => api.request<EmployeeView[]>('/employees/directory');

export const updateEmployee = (_accessToken: string, id: string, input: UpdateEmployeeInput) =>
  api.request<EmployeeView>(`/employees/${id}`, { method: 'PATCH', body: input });

export const uploadDocument = (_accessToken: string, employeeId: string, file: File, type: DocumentType) =>
  api.request<DocumentItem>(`/employees/${employeeId}/documents`, { method: 'POST', body: form(file, { type }) });

export const getDocumentUrl = (_accessToken: string, employeeId: string, documentId: string) =>
  api.request<SignedDocumentUrl>(`/employees/${employeeId}/documents/${documentId}/url`);

export const deleteDocument = (_accessToken: string, employeeId: string, documentId: string) =>
  api.request<void>(`/employees/${employeeId}/documents/${documentId}`, { method: 'DELETE' });

export const uploadAvatar = (_accessToken: string, employeeId: string, file: File) =>
  api.request<EmployeeView>(`/employees/${employeeId}/avatar`, { method: 'PATCH', body: form(file) });

export const deleteAvatar = (_accessToken: string, employeeId: string) =>
  api.request<EmployeeView>(`/employees/${employeeId}/avatar`, { method: 'DELETE' });

export const requestNationalIdChange = (_accessToken: string, newValue: string) =>
  api.request<{ id: string }>('/employees/national-id-requests', { method: 'POST', body: { newValue } });

export const cancelNationalIdChangeRequest = (_accessToken: string, requestId: string) =>
  api.request<{ id: string }>(`/employees/national-id-requests/${requestId}/cancel`, { method: 'PATCH' });
