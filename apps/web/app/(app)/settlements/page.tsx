import { SettlementPage } from '@/modules/settlement/components/settlement-page';
import { RequirePermission } from '@/modules/settings/components/require-permission';

export default function Page() {
  return (
    <RequirePermission permission="settlement.read">
      <SettlementPage />
    </RequirePermission>
  );
}
