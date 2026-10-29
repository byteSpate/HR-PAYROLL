import { RequirePermission } from '@/modules/settings/components/require-permission';
import { UsersPage } from '@/modules/settings/components/users-page';

export default function Page() {
  return (
    <RequirePermission permission="user.manage">
      <UsersPage />
    </RequirePermission>
  );
}
