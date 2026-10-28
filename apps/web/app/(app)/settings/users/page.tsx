import { PageHeader } from '@erp/ui/page';
import { RequirePermission } from '@/modules/settings/components/require-permission';
import { UsersTable } from '@/modules/settings/components/users-table';

export default function UsersPage() {
  return (
    <RequirePermission permission="user.manage">
      <PageHeader kicker="Settings" title="Users" />
      <UsersTable />
    </RequirePermission>
  );
}
