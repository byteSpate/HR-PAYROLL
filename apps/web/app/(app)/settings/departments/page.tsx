'use client';

import { useSession } from '@/lib/session';
import { DepartmentsPanel } from '@/modules/department/components/departments-panel';
import { RequirePermission } from '@/modules/settings/components/require-permission';
import { SettingsPage } from '@/modules/settings/components/settings-page';

export default function Page() {
  const { accessToken } = useSession();
  return (
    <RequirePermission permission="department.manage">
      <SettingsPage section="/settings/departments">
        <DepartmentsPanel accessToken={accessToken} />
      </SettingsPage>
    </RequirePermission>
  );
}
