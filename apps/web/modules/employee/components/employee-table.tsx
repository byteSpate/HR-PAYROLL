'use client';

import Link from 'next/link';
import type { EmployeeView } from '@erp/contracts/employee';
import { DataTable, type DataColumn } from '@erp/ui/components/data-table';
import { Tag } from '@erp/ui/page';
import { STATUS_TONE, humanize } from '../labels';
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
        <Tag label={humanize(e.employment.employmentStatus)} tone={STATUS_TONE[e.employment.employmentStatus] ?? 'neutral'} />
      ) : null,
  },
];

export function EmployeeTable({ rows, loading, error, empty }: { rows: EmployeeView[] | undefined; loading: boolean; error: string | null; empty: string }) {
  return <DataTable columns={columns} rows={rows} rowKey={(e) => e.id} loading={loading} error={error} empty={empty} />;
}
