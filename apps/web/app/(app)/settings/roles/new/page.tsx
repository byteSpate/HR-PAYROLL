import { PageHeader } from '@erp/ui/page';
import { RequirePermission } from '@/modules/settings/components/require-permission';
import { RoleForm } from '@/modules/settings/components/role-form';

export default function NewRolePage() {
  return (
    <RequirePermission permission="role.manage">
      <PageHeader kicker="Settings" title="New role" />
      <RoleForm />
    </RequirePermission>
  );
}
