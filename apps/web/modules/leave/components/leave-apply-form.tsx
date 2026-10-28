'use client';
import { useEffect, useState } from 'react';
import { Button } from '@erp/ui/components/button';
export interface LeaveChoice { id: string; name: string; isPaid: boolean; balance: number }
export interface LeaveApplication { leaveTypeId: string; startDate: string; endDate: string; startSession: 'FIRST_HALF' | 'SECOND_HALF'; endSession: 'FIRST_HALF' | 'SECOND_HALF'; reason: string }
export function LeaveApplyForm({ types, preview, onSubmit, busy = false }: { types: LeaveChoice[]; preview: (request: LeaveApplication) => number | { chargedDays: number; available: number | null } | Promise<number | { chargedDays: number; available: number | null }>; onSubmit: (request: LeaveApplication) => void; busy?: boolean }) {
  const [value, setValue] = useState<LeaveApplication>({ leaveTypeId: types[0]?.id ?? '', startDate: '', endDate: '', startSession: 'FIRST_HALF', endSession: 'SECOND_HALF', reason: '' });
  const selected = types.find(t => t.id === value.leaveTypeId);
  const key = JSON.stringify(value);
  const validRange = Boolean(value.startDate && value.endDate && value.startDate <= value.endDate && value.leaveTypeId);
  const [result, setResult] = useState<{ key: string; days: number; available: number | null } | null>(null);
  useEffect(() => {
    let active = true;
    if (!validRange) return;
    Promise.resolve(preview(value)).then(response => {
      if (active) setResult({ key, days: typeof response === 'number' ? response : response.chargedDays, available: typeof response === 'number' ? null : response.available });
    }, () => { if (active) setResult({ key, days: 0, available: null }); });
    return () => { active = false; };
  }, [value, key, validRange, preview]);
  const current = result?.key === key ? result : null;
  const days = current?.days ?? 0;
  const loading = validRange && !current;
  const balance = current?.available ?? selected?.balance ?? 0;
  const disabled = busy || loading || !selected || days <= 0 || (selected.isPaid && days > balance);
  return <form className="space-y-4 rounded-2xl border border-line bg-white p-6" onSubmit={e => { e.preventDefault(); if (!disabled) onSubmit(value); }}>
    <label className="block">Leave type<select aria-label="Leave type" className="mt-1 block w-full rounded border p-2" value={value.leaveTypeId} onChange={e => setValue({ ...value, leaveTypeId: e.target.value })}>{types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
    <label className="block">Start date<input aria-label="Start date" type="date" className="mt-1 block w-full rounded border p-2" value={value.startDate} onChange={e => setValue({ ...value, startDate: e.target.value })} /></label>
    <label className="block">End date<input aria-label="End date" type="date" className="mt-1 block w-full rounded border p-2" value={value.endDate} onChange={e => setValue({ ...value, endDate: e.target.value })} /></label>
    <label className="block">Start session<select aria-label="Start session" className="mt-1 block w-full rounded border p-2" value={value.startSession} onChange={e => setValue({ ...value, startSession: e.target.value as LeaveApplication['startSession'] })}><option value="FIRST_HALF">First half</option><option value="SECOND_HALF">Second half</option></select></label>
    <label className="block">End session<select aria-label="End session" className="mt-1 block w-full rounded border p-2" value={value.endSession} onChange={e => setValue({ ...value, endSession: e.target.value as LeaveApplication['endSession'] })}><option value="FIRST_HALF">First half</option><option value="SECOND_HALF">Second half</option></select></label>
    <label className="block">Reason<textarea className="mt-1 block w-full rounded border p-2" value={value.reason} onChange={e => setValue({ ...value, reason: e.target.value })} /></label>
    <p>{days} days charged</p>{selected?.isPaid && days > balance && <p className="text-red-700">Insufficient balance</p>}
    <Button type="submit" disabled={disabled}>Submit request</Button>
  </form>;
}
