import type { DepartmentView } from '@erp/contracts/department';
import { api } from '@/lib/api-client';

export const listDepartments = () => api.request<DepartmentView[]>('/departments');
export const createDepartment = (name: string) =>
  api.request<DepartmentView>('/departments', { method: 'POST', body: { name } });
export const renameDepartment = (id: string, name: string) =>
  api.request<DepartmentView>(`/departments/${id}`, { method: 'PATCH', body: { name } });
export const deleteDepartment = (id: string) => api.request<void>(`/departments/${id}`, { method: 'DELETE' });
