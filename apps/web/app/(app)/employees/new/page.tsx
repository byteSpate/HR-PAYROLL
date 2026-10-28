import { EmployeeForm } from '@/modules/employee/components/employee-form';
import { RequirePermission } from '@/modules/settings/components/require-permission';

export default function NewEmployeePage() {
  return (
    <RequirePermission permission="employee.create">
      <h1 className="mb-4 font-heading text-2xl font-bold tracking-tight">Add Employee</h1>
      <EmployeeForm />
    </RequirePermission>
  );
}
