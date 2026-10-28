import type { DepartmentView } from '@erp/contracts/department';
import type { GuideRow, ImportPreviewResult } from '@erp/ui/components/import-wizard';
import { api } from '@/lib/api-client';

const fileForm = (file: File) => {
  const form = new FormData();
  form.append('file', file);
  return form;
};

export const listDepartments = () => api.request<DepartmentView[]>('/departments');
export const createDepartment = (name: string) =>
  api.request<DepartmentView>('/departments', { method: 'POST', body: { name } });
export const renameDepartment = (id: string, name: string) =>
  api.request<DepartmentView>(`/departments/${id}`, { method: 'PATCH', body: { name } });
export const deleteDepartment = (id: string) => api.request<void>(`/departments/${id}`, { method: 'DELETE' });
export const exportDepartments = (format: 'xlsx' | 'csv') => api.download(`/departments/export?format=${format}`);

export const importGuide = () => api.request<GuideRow[]>('/departments/import/guide');
export const importTemplate = (format: 'xlsx' | 'csv') => api.download(`/departments/import/template?format=${format}`);
export const previewImport = (file: File) =>
  api.request<ImportPreviewResult>('/departments/import/preview', { method: 'POST', body: fileForm(file) });
export const commitImport = (file: File) =>
  api.request<{ created: number }>('/departments/import/commit', { method: 'POST', body: fileForm(file) });
