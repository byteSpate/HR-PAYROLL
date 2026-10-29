'use client';

import { useSession } from '@/lib/session';
import { LeaveTypesPanel } from '@/modules/leave/components/leave-types-panel';
import { RequirePermission } from '@/modules/settings/components/require-permission';
import { SettingsPage } from '@/modules/settings/components/settings-page';

export default function Page() {
  const { accessToken } = useSession();
  return (
    <RequirePermission permission="leave.config">
      <SettingsPage section="/settings/leave-types">
        <LeaveTypesPanel accessToken={accessToken} />
      </SettingsPage>
    </RequirePermission>
  );
}
