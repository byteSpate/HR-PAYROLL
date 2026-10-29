import { AssetPage } from '@/modules/asset/components/asset-page';
import { RequirePermission } from '@/modules/settings/components/require-permission';

export default function Page() {
  return (
    <RequirePermission permission={['asset.read', 'asset.approve', 'asset.manage']}>
      <AssetPage view="company" />
    </RequirePermission>
  );
}
