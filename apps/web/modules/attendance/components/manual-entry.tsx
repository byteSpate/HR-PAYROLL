'use client';
import { useState } from 'react';
import { Button } from '@erp/ui/components/button';
export interface ManualInput { employeeId: string; date: string; checkIn: string; checkOut: string; note: string }
export function ManualEntry({ onSubmit, employees, busy = false }: { onSubmit: (data: ManualInput) => void; employees: { id: string; fullName: string; employeeCode: string }[]; busy?: boolean }) {
  const [value, setValue] = useState<ManualInput>({ employeeId: '', date: '', checkIn: '', checkOut: '', note: '' });
  const field = (key: keyof ManualInput, label: string, type: string) => <label className="block">{label}<input aria-label={label} required type={type} className="mt-1 block w-full rounded border p-2" value={value[key]} onChange={e => setValue({ ...value, [key]: e.target.value })} /></label>;
  return <form className="space-y-4 rounded-2xl border border-line bg-white p-6" onSubmit={e => { e.preventDefault(); onSubmit(value); }}><label className="block">Employee<select aria-label="Employee" required className="mt-1 block w-full rounded border p-2" value={value.employeeId} onChange={e => setValue({ ...value, employeeId: e.target.value })}><option value="">Choose an employee</option>{employees.map(employee => <option key={employee.id} value={employee.id}>{employee.fullName} ({employee.employeeCode})</option>)}</select></label>{field('date', 'Date', 'date')}{field('checkIn', 'Check in', 'time')}{field('checkOut', 'Check out', 'time')}{field('note', 'Reason', 'text')}<Button type="submit" disabled={busy}>Save entry</Button></form>;
}
