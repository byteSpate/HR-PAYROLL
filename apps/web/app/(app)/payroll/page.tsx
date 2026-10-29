import { PayrollPage } from '@/modules/payroll/components/payroll-page';
import { RequirePermission } from '@/modules/settings/components/require-permission';

export default function Page() {
  return (
    <RequirePermission permission="payroll.read:all">
      <PayrollPage view="runs" />
    </RequirePermission>
  );
}
