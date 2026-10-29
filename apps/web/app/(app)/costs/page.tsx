import { CostPage } from '@/modules/cost/components/cost-page';
import { RequirePermission } from '@/modules/settings/components/require-permission';

export default function Page() {
  return (
    <RequirePermission permission={['cost.read', 'cost.manage']}>
      <CostPage />
    </RequirePermission>
  );
}
