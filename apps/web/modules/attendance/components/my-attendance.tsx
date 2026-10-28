'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@erp/ui/page';
import { DataTable, type DataColumn } from '@erp/ui/components/data-table';
import { PunchCard } from './punch-card';
import * as api from '../api';
const officeDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const columns: DataColumn<api.AttendanceRow>[] = [
  { key: 'date', header: 'Date', cell: r => r.date.slice(0, 10) },
  { key: 'in', header: 'Check in', cell: r => r.checkIn ? new Date(r.checkIn).toLocaleTimeString() : '—' },
  { key: 'out', header: 'Check out', cell: r => r.checkOut ? new Date(r.checkOut).toLocaleTimeString() : '—' },
  { key: 'status', header: 'Status', cell: r => r.approval },
];
export function MyAttendance() {
  const today = officeDate();
  const client = useQueryClient();
  const query = useQuery({ queryKey: ['my-attendance', today.slice(0, 7)], queryFn: () => api.myAttendance(today.slice(0, 7)) });
  const record = query.data?.find(r => r.date.slice(0, 10) === today) ?? null;
  const mutation = useMutation({ mutationFn: (action: 'check-in' | 'check-out') => api.punch(action), onSuccess: () => client.invalidateQueries({ queryKey: ['my-attendance'] }) });
  return <><PageHeader kicker="My Space" title="My attendance" /><PunchCard record={record} busy={query.isPending || mutation.isPending} onPunch={() => mutation.mutate(record?.checkIn ? 'check-out' : 'check-in')} />{mutation.error && <p role="alert">{mutation.error.message}</p>}<div className="mt-6"><DataTable columns={columns} rows={query.data} rowKey={r => r.id} loading={query.isPending} error={query.error?.message} empty="No attendance records this month." /></div></>;
}
