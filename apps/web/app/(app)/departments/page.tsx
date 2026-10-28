import { DepartmentTable } from '@/modules/department/components/department-table';
import { RequirePermission } from '@/modules/settings/components/require-permission';

export default function DepartmentsPage() {
  return (
    <RequirePermission permission="department.read">
      <h1 className="mb-4 font-heading text-2xl font-bold tracking-tight">Departments</h1>
      <DepartmentTable />
    </RequirePermission>
  );
}
