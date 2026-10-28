'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DataTable, type DataColumn } from '@erp/ui/components/data-table';
import { Button } from '@erp/ui/components/button';
import { PageHeader } from '@erp/ui/page';
import * as api from '../api';
export function LeaveTypes() {
  const client = useQueryClient();
  const [name, setName] = useState(''); const [code, setCode] = useState(''); const [quota, setQuota] = useState(0);
  const [editing, setEditing] = useState<api.LeavePolicy | null>(null);
  const query = useQuery({ queryKey: ['leave-types'], queryFn: api.types });
  const refresh = () => client.invalidateQueries({ queryKey: ['leave-types'] });
  const save = useMutation({ mutationFn: () => api.saveType({ ...(editing ?? { eligibleFor: ['FULL_TIME', 'PART_TIME', 'CONTRACT'] }), name, code, annualQuota: quota }, editing?.id), onSuccess: () => { setName(''); setCode(''); setQuota(0); setEditing(null); return refresh(); } });
  const remove = useMutation({ mutationFn: (id: string) => api.deleteType(id), onSuccess: refresh });
  const columns: DataColumn<api.LeaveType>[] = [{ key: 'name', header: 'Name', cell: r => r.name }, { key: 'paid', header: 'Paid', cell: r => r.isPaid ? 'Yes' : 'No' }, { key: 'actions', header: 'Actions', cell: r => <div className="flex gap-2"><Button variant="outline" onClick={() => { const policy = r as api.LeavePolicy; setEditing(policy); setName(policy.name); setCode(policy.code); setQuota(policy.annualQuota); }}>Edit</Button><Button variant="outline" onClick={() => remove.mutate(r.id)}>Delete</Button></div> }];
  return <><PageHeader kicker="Leave" title="Leave types" /><DataTable columns={columns} rows={query.data} rowKey={r => r.id} loading={query.isPending} error={query.error?.message} /><form className="mt-6 space-y-3 rounded border border-line bg-white p-5" onSubmit={e => { e.preventDefault(); save.mutate(); }}><label className="block">Code <input required value={code} onChange={e => setCode(e.target.value)} className="rounded border p-2" /></label><label className="block">Name <input required value={name} onChange={e => setName(e.target.value)} className="rounded border p-2" /></label><label className="block">Annual quota <input type="number" min="0" value={quota} onChange={e => setQuota(Number(e.target.value))} className="rounded border p-2" /></label><Button type="submit">{editing ? 'Save changes' : 'Add leave type'}</Button></form>{(save.error || remove.error) && <p role="alert">{(save.error || remove.error)?.message}</p>}</>;
}
