import { PageHeader } from '@erp/ui/page';
import { ShiftSelect } from '@/modules/attendance/components/shift-select';
import { EmployeeForm } from '@/modules/employee/components/employee-form';
import { RequirePermission } from '@/modules/settings/components/require-permission';

export default function NewEmployeePage() {
  return (
    <RequirePermission permission="employee.create">
      <PageHeader kicker="Employees" title="Add employee" />
      <EmployeeForm extraFields={<ShiftSelect />} />
    </RequirePermission>
  );
}
