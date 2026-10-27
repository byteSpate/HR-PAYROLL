'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from './api';

// Role changes alter what users show, so both lists are refreshed together.
const KEYS = { users: ['users'], roles: ['roles'], roleOptions: ['roles', 'options'], permissions: ['permissions'] } as const;

export const useUsers = (q: string) => useQuery({ queryKey: [...KEYS.users, q], queryFn: () => api.listUsers(q) });
export const useRoles = () => useQuery({ queryKey: KEYS.roles, queryFn: api.listRoles, retry: false });
export const useRoleOptions = () =>
  useQuery({ queryKey: KEYS.roleOptions, queryFn: api.listRoleOptions, retry: false });
export const usePermissionGroups = () =>
  useQuery({ queryKey: KEYS.permissions, queryFn: api.listPermissionGroups, retry: false });

function useInvalidating<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>, keys: readonly (readonly string[])[]) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => Promise.all(keys.map((queryKey) => qc.invalidateQueries({ queryKey }))),
  });
}

export const useCreateUser = () => useInvalidating(api.createUser, [KEYS.users]);
export const useSetUserRole = () =>
  useInvalidating(({ id, roleId }: { id: string; roleId: string | null }) => api.setUserRole(id, roleId), [KEYS.users]);
export const useSetUserStatus = () =>
  useInvalidating(({ id, isActive }: { id: string; isActive: boolean }) => api.setUserStatus(id, isActive), [KEYS.users]);
export const useCreateRole = () => useInvalidating(api.createRole, [KEYS.roles, KEYS.users]);
export const useUpdateRole = () =>
  useInvalidating(({ id, ...body }: api.RoleInput & { id: string }) => api.updateRole(id, body), [KEYS.roles, KEYS.users]);
export const useDeleteRole = () => useInvalidating(api.deleteRole, [KEYS.roles, KEYS.users]);
