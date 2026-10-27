import { RequirePermission } from '@/modules/settings/components/require-permission';
import { UsersTable } from '@/modules/settings/components/users-table';

export default function UsersPage() {
  return (
    <RequirePermission permission="user.manage">
      <h1 className="mb-4 font-heading text-2xl font-bold tracking-tight">Users</h1>
      <UsersTable />
    </RequirePermission>
  );
}
