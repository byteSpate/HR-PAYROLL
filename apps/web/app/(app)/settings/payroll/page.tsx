'use client';

import { useSession } from '@/lib/session';
import { PayrollSettingsPanel } from '@/modules/payroll/components/payroll-settings-panel';
import { RequirePermission } from '@/modules/settings/components/require-permission';
import { SettingsPage } from '@/modules/settings/components/settings-page';

export default function Page() {
  const { accessToken } = useSession();
  return (
    <RequirePermission permission="payroll.config">
      <SettingsPage section="/settings/payroll">
        <PayrollSettingsPanel accessToken={accessToken ?? ''} />
      </SettingsPage>
    </RequirePermission>
  );
}
