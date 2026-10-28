'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@erp/ui/page';
import { ApprovalsTable } from './approvals-table';
import * as api from '../api';
export function AttendanceApprovals() {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ['attendance-approvals'], queryFn: () => api.listAttendance('/approvals?status=PENDING') });
  const mutation = useMutation({ mutationFn: ({ ids, decision, note }: { ids: string[]; decision: 'APPROVED' | 'REJECTED'; note: string }) => api.bulkDecide(ids, decision, note), onSuccess: () => client.invalidateQueries({ queryKey: ['attendance-approvals'] }) });
  return <><PageHeader kicker="Attendance" title="Approvals" />{query.isPending ? <p>Loading approvals…</p> : query.error ? <p role="alert">{query.error.message}</p> : <ApprovalsTable rows={(query.data ?? []).map(row => ({ id: row.id, name: row.employee?.fullName ?? 'Employee', date: row.date.slice(0, 10), exceptions: row.exceptions }))} onDecide={(ids, decision, note) => mutation.mutate({ ids, decision, note })} />}{mutation.error && <p role="alert">{mutation.error.message}</p>}{mutation.data?.results.some(result => result.status !== 200) && <p role="alert">Some records could not be decided. Refresh and try again.</p>}</>;
}
