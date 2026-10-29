'use client';

import { useSession } from '@/lib/session';
import { ShiftsPanel } from '@/modules/attendance/components/shifts-panel';
import { RequirePermission } from '@/modules/settings/components/require-permission';
import { SettingsPage } from '@/modules/settings/components/settings-page';

export default function Page() {
  const { accessToken } = useSession();
  return (
    <RequirePermission permission="attendance.config">
      <SettingsPage section="/settings/shifts">
        <ShiftsPanel accessToken={accessToken} />
      </SettingsPage>
    </RequirePermission>
  );
}
