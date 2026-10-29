'use client';

import { useSession } from '@/lib/session';
import { AssetCategoriesPanel } from '@/modules/asset/components/asset-categories-panel';
import { RequirePermission } from '@/modules/settings/components/require-permission';
import { SettingsPage } from '@/modules/settings/components/settings-page';

export default function Page() {
  const { accessToken } = useSession();
  return (
    <RequirePermission permission="asset.config">
      <SettingsPage section="/settings/asset-categories">
        <AssetCategoriesPanel accessToken={accessToken} />
      </SettingsPage>
    </RequirePermission>
  );
}
