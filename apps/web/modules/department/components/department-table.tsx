'use client';

import { RiAddLine } from '@remixicon/react';
import { toast } from 'sonner';
import type { DepartmentView } from '@erp/contracts/department';
import { Button } from '@erp/ui/components/button';
import { DataTable, type DataColumn } from '@erp/ui/components/data-table';
import { ExportMenu } from '@erp/ui/components/export-menu';
import { can } from '@erp/auth/permissions';
import { useSession } from '@/lib/session';
import { saveDownload } from '@/lib/save-download';
import { exportDepartments } from '../api';
import { useCreateDepartment, useDeleteDepartment, useDepartments, useRenameDepartment } from '../hooks';
import { DepartmentFormDialog } from './department-form-dialog';

export function DepartmentTable() {
  const { user } = useSession();
  const { data, error, isPending } = useDepartments();
  const create = useCreateDepartment();
  const rename = useRenameDepartment();
  const remove = useDeleteDepartment();
  const canManage = !!user && can(user, 'department.manage');

  const onDelete = async (d: DepartmentView) => {
    if (!window.confirm(`Delete ${d.name}?`)) return;
    try {
      await remove.mutateAsync(d.id);
      toast.success(`${d.name} deleted`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const onExport = async (format: 'xlsx' | 'csv') => {
    try {
      saveDownload(await exportDepartments(format));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const columns: DataColumn<DepartmentView>[] = [
    { key: 'name', header: 'Name', cell: (d) => d.name, sortValue: (d) => d.name },
    { key: 'employees', header: 'Employees', cell: (d) => d.employeeCount, sortValue: (d) => d.employeeCount },
    ...(canManage
      ? [
          {
            key: 'actions',
            header: '',
            className: 'text-right',
            cell: (d: DepartmentView) => (
              <div className="flex justify-end gap-2">
                <DepartmentFormDialog
                  title="Rename department"
                  initialName={d.name}
                  trigger={<Button variant="outline" size="sm">Rename</Button>}
                  onSave={(name) => rename.mutateAsync({ id: d.id, name })}
                />
                <Button variant="destructive" size="sm" onClick={() => onDelete(d)}>
                  Delete
                </Button>
              </div>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <ExportMenu onExport={onExport} />
        {canManage ? (
          <DepartmentFormDialog
            title="New department"
            trigger={
              <Button>
                <RiAddLine />
                New department
              </Button>
            }
            onSave={(name) => create.mutateAsync(name)}
          />
        ) : null}
      </div>
      <DataTable
        columns={columns}
        rows={data}
        rowKey={(d) => d.id}
        loading={isPending}
        error={error?.message ?? null}
        empty="No departments yet."
      />
    </div>
  );
}
