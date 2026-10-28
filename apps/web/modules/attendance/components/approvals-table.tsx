'use client';
import { useState } from 'react';
import { Button } from '@erp/ui/components/button';
export function ApprovalsTable({ rows, onDecide }: { rows: { id: string; name: string; date: string; exceptions?: string[] }[]; onDecide: (ids: string[], decision: 'APPROVED' | 'REJECTED', note: string) => void }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const active = selected.filter(id => rows.some(row => row.id === id));
  return <section className="space-y-4 rounded-2xl border border-line bg-white p-5"><table className="w-full text-left text-sm"><thead><tr><th>Select</th><th>Employee</th><th>Date</th><th>Exceptions</th></tr></thead><tbody>{rows.map(row => <tr key={row.id} className="border-t border-line"><td className="py-3"><input aria-label={`Select ${row.name}`} type="checkbox" checked={selected.includes(row.id)} onChange={e => setSelected(e.target.checked ? [...selected, row.id] : selected.filter(id => id !== row.id))} /></td><td>{row.name}</td><td>{row.date}</td><td>{row.exceptions?.join(', ') || '—'}</td></tr>)}</tbody></table><label className="block">Decision note<input aria-label="Decision note" className="ml-2 rounded border p-2" value={note} onChange={e => setNote(e.target.value)} /></label><div className="flex gap-2"><Button disabled={!active.length} onClick={() => onDecide(active, 'APPROVED', note)}>Approve selected</Button><Button variant="outline" disabled={!active.length || !note.trim()} onClick={() => onDecide(active, 'REJECTED', note)}>Reject selected</Button></div></section>;
}
