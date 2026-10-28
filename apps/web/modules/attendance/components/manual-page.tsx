'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@erp/ui/page';
import { Button } from '@erp/ui/components/button';
import { ManualEntry, type ManualInput } from './manual-entry';
import * as api from '../api';
export function ManualPage() {
  const client = useQueryClient();
  const employees = useQuery({ queryKey: ['manual-employees'], queryFn: api.manualEmployees });
  const [date, setDate] = useState(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()));
  const [recordId, setRecordId] = useState(''); const [checkIn, setCheckIn] = useState(''); const [checkOut, setCheckOut] = useState(''); const [note, setNote] = useState('');
  const records = useQuery({ queryKey: ['manual-records', date], queryFn: () => api.manualRecords(date), enabled: Boolean(date) });
  const mutation = useMutation({ mutationFn: (input: ManualInput) => api.manual(input), onSuccess: () => client.invalidateQueries({ queryKey: ['manual-records'] }) });
  const correction = useMutation({ mutationFn: () => api.correct(recordId, { ...(checkIn ? { checkIn } : {}), ...(checkOut ? { checkOut } : {}), note }), onSuccess: () => client.invalidateQueries({ queryKey: ['manual-records'] }) });
  return <><PageHeader kicker="Attendance" title="Manual entry" /><ManualEntry employees={employees.data ?? []} onSubmit={data => mutation.mutate(data)} busy={mutation.isPending} />{mutation.isSuccess && <p role="status">Entry saved.</p>}{mutation.error && <p role="alert">{mutation.error.message}</p>}<form className="mt-6 space-y-3 rounded border border-line bg-white p-5" onSubmit={e => { e.preventDefault(); correction.mutate(); }}><h2 className="font-semibold">Correct an existing record</h2><label className="block">Record date <input type="date" required value={date} onChange={e => { setDate(e.target.value); setRecordId(''); }} /></label><label className="block">Record <select required value={recordId} onChange={e => setRecordId(e.target.value)}><option value="">Choose a record</option>{records.data?.map(row => <option key={row.id} value={row.id}>{row.employee?.fullName} ({row.employee?.employeeCode})</option>)}</select></label><label className="block">New check in <input type="time" value={checkIn} onChange={e => setCheckIn(e.target.value)} /></label><label className="block">New check out <input type="time" value={checkOut} onChange={e => setCheckOut(e.target.value)} /></label><label className="block">Correction reason <input required value={note} onChange={e => setNote(e.target.value)} /></label><Button type="submit" disabled={correction.isPending}>Correct record</Button>{correction.isSuccess && <p role="status">Correction saved.</p>}{correction.error && <p role="alert">{correction.error.message}</p>}</form></>;
}
