'use client';

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from './api';

// Role changes alter what users show, so both lists are refreshed together.
const KEYS = { users: ['users'], roles: ['roles'], permissions: ['permissions'] } as const;

export const useRoles = () => useQuery({ queryKey: KEYS.roles, queryFn: api.listRoles, retry: false });
export const useAudit = () =>
  useInfiniteQuery({
    queryKey: ['audit'],
    queryFn: ({ pageParam }) => api.listAudit(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
export const usePermissionGroups = () =>
  useQuery({ queryKey: KEYS.permissions, queryFn: api.listPermissionGroups, retry: false });

function useInvalidating<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>, keys: readonly (readonly string[])[]) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => Promise.all(keys.map((queryKey) => qc.invalidateQueries({ queryKey }))),
  });
}

export const useCreateRole = () => useInvalidating(api.createRole, [KEYS.roles, KEYS.users]);
export const useUpdateRole = () =>
  useInvalidating(({ id, ...body }: api.RoleInput & { id: string }) => api.updateRole(id, body), [KEYS.roles, KEYS.users]);
export const useDeleteRole = () => useInvalidating(api.deleteRole, [KEYS.roles, KEYS.users]);
