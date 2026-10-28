'use client';

import Link from 'next/link';
import type { EmployeeView } from '@erp/contracts/employee';
import { Badge } from '@erp/ui/components/badge';
import { DataTable, type DataColumn } from '@erp/ui/components/data-table';
import { humanize } from '../labels';
import { EmployeeAvatar } from './avatar';

const columns: DataColumn<EmployeeView>[] = [
  {
    key: 'name',
    header: 'Name',
    sortValue: (e) => e.work.fullName,
    cell: (e) => (
      <Link href={`/employees/${e.id}`} className="flex items-center gap-2 font-medium hover:underline">
        <EmployeeAvatar name={e.work.fullName} url={e.work.avatarUrl} className="size-8 text-xs" />
        {e.work.fullName}
      </Link>
    ),
  },
  { key: 'code', header: 'Code', sortValue: (e) => e.employeeCode, cell: (e) => e.employeeCode },
  { key: 'designation', header: 'Designation', sortValue: (e) => e.work.designation, cell: (e) => e.work.designation },
  { key: 'department', header: 'Department', sortValue: (e) => e.work.department.name, cell: (e) => e.work.department.name },
  {
    key: 'status',
    header: 'Status',
    sortValue: (e) => e.employment?.employmentStatus,
    cell: (e) =>
      e.employment ? (
        <Badge variant={e.employment.employmentStatus === 'ACTIVE' ? 'default' : 'secondary'}>
          {humanize(e.employment.employmentStatus)}
        </Badge>
      ) : null,
  },
];

export function EmployeeTable({ rows, loading, error, empty }: { rows: EmployeeView[] | undefined; loading: boolean; error: string | null; empty: string }) {
  return <DataTable columns={columns} rows={rows} rowKey={(e) => e.id} loading={loading} error={error} empty={empty} />;
}
