'use client';
import { useMutation, useQuery } from '@tanstack/react-query';
import { PageHeader } from '@erp/ui/page';
import { ManualEntry, type ManualInput } from './manual-entry';
import * as api from '../api';
export function ManualPage() {
  const employees = useQuery({ queryKey: ['manual-employees'], queryFn: api.manualEmployees });
  const mutation = useMutation({ mutationFn: (input: ManualInput) => api.manual(input) });
  return <><PageHeader kicker="Attendance" title="Manual entry" /><ManualEntry employees={employees.data ?? []} onSubmit={data => mutation.mutate(data)} busy={mutation.isPending} />{mutation.isSuccess && <p role="status">Entry saved.</p>}{mutation.error && <p role="alert">{mutation.error.message}</p>}</>;
}
