'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@erp/ui/components/button';
import { DataTable, type DataColumn } from '@erp/ui/components/data-table';
import { PageHeader, Tag } from '@erp/ui/page';
import * as api from '../api';
export function LeaveList({ mode }: { mode: 'mine' | 'team' | 'approvals' | 'status' }) {
  const client = useQueryClient();
  const [note, setNote] = useState('');
  const query = useQuery({ queryKey: ['leave-requests', mode], queryFn: () => mode === 'status' ? api.teamStatus() : api.requests(mode) });
  const mutation = useMutation({ mutationFn: ({ id, action }: { id: string; action: 'approve' | 'reject' | 'cancel' }) => api.decide(id, action, note), onSuccess: () => client.invalidateQueries({ queryKey: ['leave-requests'] }) });
  const rows = mode === 'approvals' ? query.data?.filter(row => row.status === 'PENDING') : query.data;
  const columns: DataColumn<api.LeaveRequest>[] = [
    { key: 'name', header: 'Employee', cell: row => row.employee.fullName },
    { key: 'type', header: 'Type', cell: row => row.leaveType.name },
    { key: 'dates', header: 'Dates', cell: row => `${row.startDate.slice(0, 10)} – ${row.endDate.slice(0, 10)}` },
    { key: 'days', header: 'Days', cell: row => row.chargedDays },
    { key: 'status', header: 'Status', cell: row => <Tag label={row.status} tone={row.status === 'APPROVED' ? 'good' : row.status === 'REJECTED' ? 'bad' : 'neutral'} /> },
    { key: 'action', header: 'Action', cell: row => row.status !== 'PENDING' ? null : mode === 'approvals' ? <div className="flex gap-2"><Button onClick={() => mutation.mutate({ id: row.id, action: 'approve' })}>Approve</Button><Button variant="outline" disabled={!note.trim()} onClick={() => mutation.mutate({ id: row.id, action: 'reject' })}>Reject</Button></div> : mode === 'mine' ? <Button variant="outline" onClick={() => mutation.mutate({ id: row.id, action: 'cancel' })}>Cancel</Button> : null },
  ];
  return <><PageHeader kicker="Leave" title={mode === 'mine' ? 'My leave' : mode === 'approvals' ? 'Leave approvals' : mode === 'status' ? 'Team status' : 'Leave requests'} />{mode === 'approvals' && <label className="mb-4 block">Rejection note <input className="rounded border p-2" value={note} onChange={e => setNote(e.target.value)} /></label>}<DataTable columns={columns} rows={rows} rowKey={r => r.id} loading={query.isPending} error={query.error?.message} empty="No leave requests." />{mutation.error && <p role="alert">{mutation.error.message}</p>}</>;
}
