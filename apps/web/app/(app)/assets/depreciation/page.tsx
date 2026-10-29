import { DepreciationPage } from '@/modules/asset/components/depreciation-page';
import { RequirePermission } from '@/modules/settings/components/require-permission';

export default function Page() {
  return (
    <RequirePermission permission="asset.capitalise">
      <DepreciationPage />
    </RequirePermission>
  );
}
