import type { PublicUser } from '@erp/contracts/core';
import { api } from '@/lib/api-client';

export type Scope = 'own' | 'team' | 'department' | 'all';

/** scope is null for an on/off permission. */
export interface RoleGrant {
  permissionKey: string;
  scope: Scope | null;
}

export interface RoleView {
  id: string;
  name: string;
  description: string | null;
  permissions: RoleGrant[];
  userCount: number;
}

export interface PermissionGroup {
  module: string;
  permissions: { key: string; label: string; scopes: Scope[] }[];
}

export interface RoleInput {
  name: string;
  description?: string;
  permissions: RoleGrant[];
}

export const listUsers = (q: string) => api.request<PublicUser[]>(`/users${q ? `?q=${encodeURIComponent(q)}` : ''}`);

export const createUser = (body: { email: string; displayName: string; roleId: string | null }) =>
  api.request<{ user: PublicUser; temporaryPassword: string }>('/users', { method: 'POST', body });

export const setUserRole = (id: string, roleId: string | null) =>
  api.request<PublicUser>(`/users/${id}/role`, { method: 'PATCH', body: { roleId } });

export const setUserStatus = (id: string, isActive: boolean) =>
  api.request<PublicUser>(`/users/${id}/status`, { method: 'PATCH', body: { isActive } });

export const setUserAccessLevel = (id: string, accessLevel: 'ADMIN' | 'STANDARD') =>
  api.request<PublicUser>(`/users/${id}/access-level`, { method: 'PATCH', body: { accessLevel } });

// For the users page: needs only user.manage, unlike listRoles.
export const listRoleOptions = () => api.request<{ id: string; name: string }[]>('/users/role-options');
export const listRoles = () => api.request<RoleView[]>('/roles');
export const listPermissionGroups = () => api.request<PermissionGroup[]>('/roles/permissions');
export const createRole = (body: RoleInput) => api.request<RoleView>('/roles', { method: 'POST', body });
export const updateRole = (id: string, body: RoleInput) =>
  api.request<RoleView>(`/roles/${id}`, { method: 'PATCH', body });
export const deleteRole = (id: string) => api.request<void>(`/roles/${id}`, { method: 'DELETE' });

export const changePassword = (body: { currentPassword: string; newPassword: string }) =>
  api.request<{ success: true; user: PublicUser }>('/auth/change-password', { method: 'POST', body });

export interface AuditRow {
  id: string;
  entity: string;
  entityId: string;
  action: string;
  changedAt: string;
  actorEmail: string | null;
  before: unknown;
  after: unknown;
}

export const listAudit = (cursor: string | null) =>
  api.request<{ items: AuditRow[]; nextCursor: string | null }>(`/audit${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`);
