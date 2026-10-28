'use client';
import { useState } from 'react';
import { Button } from '@erp/ui/components/button';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@erp/ui/page';
import { DataTable, type DataColumn } from '@erp/ui/components/data-table';
import { PunchCard } from './punch-card';
import * as api from '../api';
const officeDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const columns: DataColumn<api.AttendanceRow>[] = [
  { key: 'date', header: 'Date', cell: r => r.date.slice(0, 10) },
  { key: 'in', header: 'Check in', cell: r => r.checkIn ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dhaka', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(r.checkIn)) : '—' },
  { key: 'out', header: 'Check out', cell: r => r.checkOut ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dhaka', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(r.checkOut)) : '—' },
  { key: 'status', header: 'Status', cell: r => r.approval },
];
export function MyAttendance() {
  const today = officeDate();
  const [date, setDate] = useState(''); const [checkIn, setCheckIn] = useState(''); const [checkOut, setCheckOut] = useState(''); const [note, setNote] = useState('');
  const client = useQueryClient();
  const query = useQuery({ queryKey: ['my-attendance', today.slice(0, 7)], queryFn: () => api.myAttendance(today.slice(0, 7)) });
  const record = query.data?.find(r => r.date.slice(0, 10) === today) ?? null;
  const mutation = useMutation({ mutationFn: (action: 'check-in' | 'check-out') => api.punch(action), onSuccess: () => client.invalidateQueries({ queryKey: ['my-attendance'] }) });
  const correction = useMutation({ mutationFn: () => api.regularise({ date, ...(checkIn ? { checkIn } : {}), ...(checkOut ? { checkOut } : {}), note }), onSuccess: () => client.invalidateQueries({ queryKey: ['my-attendance'] }) });
  return <><PageHeader kicker="My Space" title="My attendance" /><PunchCard record={record} busy={query.isPending || mutation.isPending} onPunch={() => mutation.mutate(record?.checkIn ? 'check-out' : 'check-in')} />{mutation.error && <p role="alert">{mutation.error.message}</p>}<div className="mt-6"><DataTable columns={columns} rows={query.data} rowKey={r => r.id} loading={query.isPending} error={query.error?.message} empty="No attendance records this month." /></div><form className="mt-6 space-y-3 rounded border border-line bg-white p-5" onSubmit={e => { e.preventDefault(); correction.mutate(); }}><h2 className="font-semibold">Request a correction</h2><label className="block">Date <input aria-label="Date to regularise" required type="date" value={date} onChange={e => setDate(e.target.value)} /></label><label className="block">Check in <input aria-label="Regularised check in" type="time" value={checkIn} onChange={e => setCheckIn(e.target.value)} /></label><label className="block">Check out <input aria-label="Regularised check out" type="time" value={checkOut} onChange={e => setCheckOut(e.target.value)} /></label><label className="block">Reason <input aria-label="Regularisation reason" required value={note} onChange={e => setNote(e.target.value)} className="rounded border p-2" /></label><Button type="submit" disabled={correction.isPending}>Request correction</Button>{correction.isSuccess && <p role="status">Correction submitted for review.</p>}{correction.error && <p role="alert">{correction.error.message}</p>}</form></>;
}
