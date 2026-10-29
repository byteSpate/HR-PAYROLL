import { AssetValuePage } from '@/modules/asset/components/asset-value-page';
import { RequirePermission } from '@/modules/settings/components/require-permission';

export default function Page() {
  return (
    <RequirePermission permission="asset.value">
      <AssetValuePage />
    </RequirePermission>
  );
}
