'use client';

import { useSession } from '@/lib/session';
import { ExchangeRatesPanel } from '@/modules/exchange/components/exchange-rates-panel';
import { RequirePermission } from '@/modules/settings/components/require-permission';
import { SettingsPage } from '@/modules/settings/components/settings-page';

export default function Page() {
  const { accessToken } = useSession();
  return (
    <RequirePermission permission="exchange.config">
      <SettingsPage section="/settings/exchange-rates">
        <ExchangeRatesPanel accessToken={accessToken} />
      </SettingsPage>
    </RequirePermission>
  );
}
