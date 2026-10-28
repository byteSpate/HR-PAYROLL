'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DataTable, type DataColumn } from '@erp/ui/components/data-table';
import { PageHeader, Tag } from '@erp/ui/page';
import * as api from '../api';
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const columns: DataColumn<api.AttendanceRow>[] = [
  { key: 'employee', header: 'Employee', cell: r => r.employee?.fullName ?? '—' },
  { key: 'date', header: 'Date', cell: r => r.date.slice(0, 10) },
  { key: 'in', header: 'Check in', cell: r => r.checkIn ? new Date(r.checkIn).toLocaleTimeString() : '—' },
  { key: 'out', header: 'Check out', cell: r => r.checkOut ? new Date(r.checkOut).toLocaleTimeString() : '—' },
  { key: 'status', header: 'Status', cell: r => <Tag label={r.approval} tone={r.approval === 'APPROVED' ? 'good' : r.approval === 'REJECTED' ? 'bad' : 'warn'} /> },
];
export function AttendanceToday() {
  const [date, setDate] = useState(today);
  const query = useQuery({ queryKey: ['attendance', date], queryFn: () => api.listAttendance(`?date=${date}`) });
  return <><PageHeader kicker="Attendance" title="Attendance" aside={<input aria-label="Date" type="date" value={date} onChange={e => setDate(e.target.value)} className="rounded border p-2" />} /><DataTable columns={columns} rows={query.data} rowKey={r => r.id} loading={query.isPending} error={query.error?.message} empty="No attendance records." /></>;
}
