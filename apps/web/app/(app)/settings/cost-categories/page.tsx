'use client';

import { useSession } from '@/lib/session';
import { CostCategoriesPanel } from '@/modules/cost/components/cost-categories-panel';
import { RequirePermission } from '@/modules/settings/components/require-permission';
import { SettingsPage } from '@/modules/settings/components/settings-page';

export default function Page() {
  const { accessToken } = useSession();
  return (
    <RequirePermission permission="cost.config">
      <SettingsPage section="/settings/cost-categories">
        <CostCategoriesPanel accessToken={accessToken} />
      </SettingsPage>
    </RequirePermission>
  );
}
