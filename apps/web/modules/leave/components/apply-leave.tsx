'use client';
import { useMutation, useQuery } from '@tanstack/react-query';
import { PageHeader } from '@erp/ui/page';
import * as api from '../api';
import { LeaveApplyForm, type LeaveApplication } from './leave-apply-form';
export function ApplyLeave() {
  const types = useQuery({ queryKey: ['leave-types'], queryFn: api.types });
  const mutation = useMutation({ mutationFn: (body: LeaveApplication) => api.apply(body) });
  return <><PageHeader kicker="Leave" title="Apply for leave" />{types.isPending ? <p>Loading leave types…</p> : types.error ? <p role="alert">{types.error.message}</p> : <LeaveApplyForm types={(types.data ?? []).map(type => ({ ...type, balance: 0 }))} preview={api.preview} onSubmit={body => mutation.mutate(body)} busy={mutation.isPending} />}{mutation.isSuccess && <p role="status" className="mt-4">Leave request submitted.</p>}{mutation.error && <p role="alert">{mutation.error.message}</p>}</>;
}
