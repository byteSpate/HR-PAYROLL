import type {
  AccountView,
  PendingEmailChange,
  PublicUser,
  ResendInviteResult,
  SessionView,
  UserAccountView,
} from '@erp/contracts/core';
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

export const listUsers = (q: string) => api.request<UserAccountView[]>(`/users${q ? `?q=${encodeURIComponent(q)}` : ''}`);

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

// The account-only profile and the sessions card were written against HR's token-threading client;
// the shared client already attaches the token, so these keep HR's signatures and ignore the first argument.
const avatarForm = (file: File) => {
  const form = new FormData();
  form.append('file', file);
  return form;
};

export const getAccount = () => api.request<AccountView>('/auth/account');
export const listSessions = (_accessToken: string) => api.request<SessionView[]>('/auth/sessions');
export const revokeSession = (_accessToken: string, sessionId: string) =>
  api.request<void>(`/auth/sessions/${sessionId}`, { method: 'DELETE' });
export const logoutEverywhere = (_accessToken: string) => api.request<void>('/auth/logout-everywhere', { method: 'POST' });
export const setDisplayName = (_accessToken: string, displayName: string | null) =>
  api.request<AccountView>('/auth/display-name', { method: 'PATCH', body: { displayName } });
export const uploadOwnAvatar = (_accessToken: string, file: File) =>
  api.request<AccountView>('/auth/avatar', { method: 'PATCH', body: avatarForm(file) });
export const clearOwnAvatar = (_accessToken: string) => api.request<AccountView>('/auth/avatar', { method: 'DELETE' });

export const requestEmailChange = (_accessToken: string, newEmail: string) =>
  api.request<PendingEmailChange>('/auth/email-change', { method: 'POST', body: { newEmail } });
export const getPendingEmailChange = (_accessToken: string) => api.request<PendingEmailChange | null>('/auth/email-change');
// The link is the proof, so these three work with no session (a phone that is not signed in, or every session revoked).
export const approveEmailChange = (token: string) =>
  api.request<{ newEmail: string }>('/auth/email-change/approve', { method: 'POST', body: { token }, skipRefresh: true });
export const cancelEmailChange = (token: string) =>
  api.request<void>('/auth/email-change/cancel', { method: 'POST', body: { token }, skipRefresh: true });
export const confirmEmailChange = (token: string) =>
  api.request<{ email: string }>('/auth/email-change/confirm', { method: 'POST', body: { token }, skipRefresh: true });
export const resendUserInvite = (_accessToken: string, userId: string) =>
  api.request<ResendInviteResult>(`/users/${userId}/resend-credentials`, { method: 'POST' });
export const resendEmployeeInvite = (_accessToken: string, employeeId: string) =>
  api.request<ResendInviteResult>(`/employees/${employeeId}/resend-invite`, { method: 'POST' });
