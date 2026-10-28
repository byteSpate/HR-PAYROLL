import { PageHeader } from '@erp/ui/page';
import { DepartmentTable } from '@/modules/department/components/department-table';
import { RequirePermission } from '@/modules/settings/components/require-permission';

export default function DepartmentsPage() {
  return (
    <RequirePermission permission="department.read">
      <PageHeader kicker="Departments" title="Department list" />
      <DepartmentTable />
    </RequirePermission>
  );
}
