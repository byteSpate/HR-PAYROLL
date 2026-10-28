'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from './api';

const KEY = ['departments'] as const;

export const useDepartments = () => useQuery({ queryKey: KEY, queryFn: api.listDepartments });
export const useImportGuide = () => useQuery({ queryKey: ['departments', 'import-guide'], queryFn: api.importGuide });

function useRefreshing<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries({ queryKey: KEY }) });
}

export const useCreateDepartment = () => useRefreshing(api.createDepartment);
export const useRenameDepartment = () =>
  useRefreshing(({ id, name }: { id: string; name: string }) => api.renameDepartment(id, name));
export const useDeleteDepartment = () => useRefreshing(api.deleteDepartment);
