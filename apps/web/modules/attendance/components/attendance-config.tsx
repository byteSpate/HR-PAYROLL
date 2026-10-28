'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@erp/ui/page';
import { Button } from '@erp/ui/components/button';
import { DataTable, type DataColumn } from '@erp/ui/components/data-table';
import { ImportWizard } from '@erp/ui/components/import-wizard';
import { ExportMenu } from '@erp/ui/components/export-menu';
import { saveDownload } from '../../../lib/save-download';
import * as api from '../api';
export function AttendanceConfig({ kind }: { kind: api.ConfigKind }) {
  const client = useQueryClient();
  const [name, setName] = useState(''); const [date, setDate] = useState(''); const [type, setType] = useState('GENERAL');
  const [start, setStart] = useState('09:00'); const [end, setEnd] = useState('18:00'); const [editing, setEditing] = useState<api.ConfigRow | undefined>();
  const query = useQuery({ queryKey: ['attendance-config', kind], queryFn: () => api.configList(kind) });
  const guide = useQuery({ queryKey: ['attendance-import-guide', kind], queryFn: () => api.importGuide(kind) });
  const refresh = () => client.invalidateQueries({ queryKey: ['attendance-config', kind] });
  const save = useMutation({ mutationFn: () => api.createConfig(kind, kind === 'holidays' ? { name, date, type } : { name, startTime: start, endTime: end, weeklyOffDays: editing?.weeklyOffDays ?? [5], graceMinutes: editing?.graceMinutes ?? 15, breakMinutes: editing?.breakMinutes ?? 60, effectiveFrom: editing?.effectiveFrom ?? null, effectiveTo: editing?.effectiveTo ?? null }, editing?.id), onSuccess: () => { setName(''); setEditing(undefined); return refresh(); } });
  const remove = useMutation({ mutationFn: (key: string) => api.deleteConfig(kind, key), onSuccess: refresh });
  const columns: DataColumn<api.ConfigRow>[] = [{ key: 'name', header: 'Name', cell: r => r.name }, { key: 'value', header: kind === 'holidays' ? 'Date' : 'Hours', cell: r => kind === 'holidays' ? r.date?.slice(0, 10) : `${r.startTime} – ${r.endTime}` }, { key: 'action', header: 'Actions', cell: r => <div className="flex gap-2"><Button variant="outline" onClick={() => { setEditing(r); setName(r.name); setDate(r.date?.slice(0, 10) ?? ''); setType(r.type ?? 'GENERAL'); setStart(r.startTime ?? '09:00'); setEnd(r.endTime ?? '18:00'); }}>Edit</Button><Button variant="outline" onClick={() => remove.mutate(r.id)}>Delete</Button></div> }];
  return <><PageHeader kicker="Attendance" title={kind === 'holidays' ? 'Holidays' : 'Shifts'} /><ExportMenu onExport={format => api.exportConfig(kind, format).then(saveDownload)} /><DataTable columns={columns} rows={query.data} rowKey={r => r.id} loading={query.isPending} error={query.error?.message} /><form className="mt-6 space-y-3 rounded border border-line bg-white p-5" onSubmit={e => { e.preventDefault(); save.mutate(); }}><label className="block">Name <input required className="rounded border p-2" value={name} onChange={e => setName(e.target.value)} /></label>{kind === 'holidays' ? <><label className="block">Date <input required type="date" value={date} onChange={e => setDate(e.target.value)} /></label><label>Type <select value={type} onChange={e => setType(e.target.value)}>{['GENERAL', 'EXECUTIVE_ORDER', 'OPTIONAL', 'WORKING_DAY'].map(v => <option key={v}>{v}</option>)}</select></label></> : <><label className="block">Start <input type="time" value={start} onChange={e => setStart(e.target.value)} /></label><label className="block">End <input type="time" value={end} onChange={e => setEnd(e.target.value)} /></label></>}<Button type="submit" disabled={save.isPending}>{editing ? 'Save changes' : kind === 'holidays' ? 'Add holiday' : 'Add shift'}</Button></form><div className="mt-8"><ImportWizard guide={guide.data} downloadTemplate={format => { void api.importTemplate(kind, format).then(saveDownload); }} preview={file => api.importPreview(kind, file)} commit={file => api.importCommit(kind, file)} onDone={() => { void refresh(); }} /></div>{(save.error || remove.error) && <p role="alert">{(save.error || remove.error)?.message}</p>}</>;
}
