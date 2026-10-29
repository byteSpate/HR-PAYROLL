import { SalaryStructuresPage } from '@/modules/payroll/components/salary-structures-page';
import { RequirePermission } from '@/modules/settings/components/require-permission';

export default function Page() {
  return (
    <RequirePermission permission={['payroll.read', 'payroll.config']}>
      <SalaryStructuresPage />
    </RequirePermission>
  );
}
