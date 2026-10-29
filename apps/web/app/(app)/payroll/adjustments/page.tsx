import { PayrollPage } from '@/modules/payroll/components/payroll-page';
import { RequirePermission } from '@/modules/settings/components/require-permission';

export default function Page() {
  return (
    <RequirePermission permission="payroll.read">
      <PayrollPage view="adjustments" />
    </RequirePermission>
  );
}
