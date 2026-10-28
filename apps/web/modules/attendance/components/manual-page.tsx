'use client';
import { useMutation } from '@tanstack/react-query';
import { PageHeader } from '@erp/ui/page';
import { ManualEntry, type ManualInput } from './manual-entry';
import * as api from '../api';
export function ManualPage() {
  const mutation = useMutation({ mutationFn: (input: ManualInput) => api.manual(input) });
  return <><PageHeader kicker="Attendance" title="Manual entry" /><ManualEntry onSubmit={data => mutation.mutate(data)} busy={mutation.isPending} />{mutation.isSuccess && <p role="status">Entry saved.</p>}{mutation.error && <p role="alert">{mutation.error.message}</p>}</>;
}
