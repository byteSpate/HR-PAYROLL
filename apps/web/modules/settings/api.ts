import type { PublicUser } from '@erp/contracts/core';
import { api } from '@/lib/api-client';

export interface RoleView {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
  userCount: number;
}

export interface PermissionGroup {
  module: string;
  permissions: { key: string; label: string }[];
}

export interface RoleInput {
  name: string;
  description?: string;
  permissions: string[];
}

export const listUsers = (q: string) => api.request<PublicUser[]>(`/users${q ? `?q=${encodeURIComponent(q)}` : ''}`);

export const createUser = (body: { email: string; displayName: string; roleIds: string[] }) =>
  api.request<{ user: PublicUser; temporaryPassword: string }>('/users', { method: 'POST', body });

export const setUserRoles = (id: string, roleIds: string[]) =>
  api.request<PublicUser>(`/users/${id}/roles`, { method: 'PATCH', body: { roleIds } });

export const setUserStatus = (id: string, isActive: boolean) =>
  api.request<PublicUser>(`/users/${id}/status`, { method: 'PATCH', body: { isActive } });

export const listRoles = () => api.request<RoleView[]>('/roles');
export const listPermissionGroups = () => api.request<PermissionGroup[]>('/roles/permissions');
export const createRole = (body: RoleInput) => api.request<RoleView>('/roles', { method: 'POST', body });
export const updateRole = (id: string, body: RoleInput) =>
  api.request<RoleView>(`/roles/${id}`, { method: 'PATCH', body });
export const deleteRole = (id: string) => api.request<void>(`/roles/${id}`, { method: 'DELETE' });

export const changePassword = (body: { currentPassword: string; newPassword: string }) =>
  api.request<{ success: true; user: PublicUser }>('/auth/change-password', { method: 'POST', body });
