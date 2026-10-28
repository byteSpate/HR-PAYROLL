'use client';
import { Button } from '@erp/ui/components/button';
export function PunchCard({ record, onPunch, busy = false }: { record: { checkIn: string | null; checkOut: string | null } | null; onPunch: () => void; busy?: boolean }) {
  const done = Boolean(record?.checkOut);
  const label = done ? 'Completed for today' : record?.checkIn ? 'Check out' : 'Check in';
  return <section className="rounded-2xl border border-line bg-white p-6 shadow-sm"><h2 className="text-lg font-semibold">Today’s attendance</h2><p className="mt-2 text-sm text-slate">{done ? 'Your workday is recorded.' : record?.checkIn ? 'You are checked in.' : 'Start your workday when you arrive.'}</p><Button className="mt-5" size="lg" disabled={busy || done} onClick={onPunch}>{label}</Button></section>;
}
