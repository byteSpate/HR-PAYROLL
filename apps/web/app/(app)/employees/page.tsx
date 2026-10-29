import { EmployeesPage } from '@/modules/people/components/employees-page';
import { RequirePermission } from '@/modules/settings/components/require-permission';

export default function Page() {
  return (
    <RequirePermission permission={['employee.read:department', 'employee.read.financial']}>
      <EmployeesPage />
    </RequirePermission>
  );
}
