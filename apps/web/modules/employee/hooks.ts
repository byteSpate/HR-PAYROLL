'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from './api';

const KEY = ['employees'] as const;

export const useEmployees = (q: string) => useQuery({ queryKey: [...KEY, 'list', q], queryFn: () => api.listEmployees(q) });
export const useDirectory = (q: string, departmentId: string) =>
  useQuery({ queryKey: [...KEY, 'directory', q, departmentId], queryFn: () => api.directory(q, departmentId || undefined) });
export const useMyTeam = () => useQuery({ queryKey: [...KEY, 'team'], queryFn: api.myTeam });
export const useMe = () => useQuery({ queryKey: [...KEY, 'me'], queryFn: api.getMe, retry: false });
export const useEmployee = (id: string) => useQuery({ queryKey: [...KEY, id], queryFn: () => api.getEmployee(id) });
export const useDocuments = (id: string, enabled = true) =>
  useQuery({ queryKey: [...KEY, id, 'documents'], queryFn: () => api.listDocuments(id), enabled, retry: false });
export const useIdRequests = (status: string) =>
  useQuery({ queryKey: [...KEY, 'id-requests', status], queryFn: () => api.listIdRequests(status || undefined) });

// Every employee change can move lists, the profile and the sidebar's team access, so the
// whole employee cache is refreshed together.
function useRefreshing<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries({ queryKey: KEY }) });
}

export const useCreateEmployee = () => useRefreshing(api.createEmployee);
export const useUpdateEmployee = () =>
  useRefreshing(({ id, patch }: { id: string; patch: Record<string, unknown> }) => api.updateEmployee(id, patch));
export const useRecordExit = () =>
  useRefreshing(({ id, body }: { id: string; body: Parameters<typeof api.recordExit>[1] }) => api.recordExit(id, body));
export const useSetAccount = () =>
  useRefreshing(({ id, isActive }: { id: string; isActive: boolean }) => api.setAccount(id, isActive));
export const useUploadDocument = () =>
  useRefreshing(({ id, type, file }: { id: string; type: string; file: File }) => api.uploadDocument(id, type, file));
export const useDeleteDocument = () =>
  useRefreshing(({ id, docId }: { id: string; docId: string }) => api.deleteDocument(id, docId));
export const useSetAvatar = () => useRefreshing(({ id, file }: { id: string; file: File }) => api.setAvatar(id, file));
export const useRequestIdChange = () => useRefreshing(api.requestIdChange);
export const useDecideIdRequest = () =>
  useRefreshing(({ id, approve, note }: { id: string; approve: boolean; note?: string }) =>
    api.decideIdRequest(id, approve, note),
  );
