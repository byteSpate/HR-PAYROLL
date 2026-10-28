'use client';

import { useDeferredValue, useState } from 'react';
import { toast } from 'sonner';
import { ExportMenu } from '@erp/ui/components/export-menu';
import { Input } from '@erp/ui/components/input';
import { PageHeader } from '@erp/ui/page';
import { saveDownload } from '@/lib/save-download';
import { exportEmployees } from '@/modules/employee/api';
import { EmployeeTable } from '@/modules/employee/components/employee-table';
import { useEmployees } from '@/modules/employee/hooks';
import { RequirePermission } from '@/modules/settings/components/require-permission';

export default function EmployeesPage() {
  const [q, setQ] = useState('');
  const query = useDeferredValue(q);
  const employees = useEmployees(query);

  return (
    <RequirePermission permission={['employee.read:department', 'employee.read.financial']}>
      <PageHeader kicker="Employees" title="Employee list" />
      <div className="mb-4 flex items-center justify-between gap-2">
        <Input placeholder="Search by name, code or email" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm" />
        <ExportMenu
          onExport={(format) => exportEmployees(format).then(saveDownload, (e: Error) => toast.error(e.message))}
        />
      </div>
      <EmployeeTable rows={employees.data} loading={employees.isPending} error={employees.error?.message ?? null} empty="No employees found." />
    </RequirePermission>
  );
}
