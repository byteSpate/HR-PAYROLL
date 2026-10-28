'use client';

import { toast } from 'sonner';
import { Button } from '@erp/ui/components/button';
import { DataTable, type DataColumn } from '@erp/ui/components/data-table';
import type { ChangeRequestView } from '../api';
import { useDecideIdRequest, useIdRequests } from '../hooks';
import { humanize } from '../labels';

export function IdRequestTable({ status }: { status: string }) {
  const requests = useIdRequests(status);
  const decide = useDecideIdRequest();

  const act = (id: string, approve: boolean) =>
    decide.mutateAsync({ id, approve }).then(
      () => toast.success(approve ? 'National ID updated' : 'Request rejected'),
      (e: Error) => toast.error(e.message),
    );

  const columns: DataColumn<ChangeRequestView>[] = [
    { key: 'employee', header: 'Employee', sortValue: (r) => r.employee.fullName, cell: (r) => `${r.employee.fullName} (${r.employee.employeeCode})` },
    { key: 'old', header: 'Current', cell: (r) => r.oldValue ?? '-' },
    { key: 'new', header: 'Requested', cell: (r) => r.newValue },
    { key: 'asked', header: 'Asked on', sortValue: (r) => r.createdAt, cell: (r) => r.createdAt.slice(0, 10) },
    { key: 'status', header: 'Status', cell: (r) => humanize(r.status) },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      cell: (r) =>
        r.status === 'PENDING' ? (
          <div className="flex justify-end gap-2">
            <Button size="sm" onClick={() => act(r.id, true)} disabled={decide.isPending}>
              Approve
            </Button>
            <Button size="sm" variant="outline" onClick={() => act(r.id, false)} disabled={decide.isPending}>
              Reject
            </Button>
          </div>
        ) : null,
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={requests.data}
      rowKey={(r) => r.id}
      loading={requests.isPending}
      error={requests.error?.message ?? null}
      empty="No requests."
    />
  );
}
