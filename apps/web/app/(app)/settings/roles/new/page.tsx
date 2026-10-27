import { RequirePermission } from '@/modules/settings/components/require-permission';
import { RoleForm } from '@/modules/settings/components/role-form';

export default function NewRolePage() {
  return (
    <RequirePermission permission="role.manage">
      <h1 className="mb-4 font-heading text-2xl font-bold tracking-tight">New role</h1>
      <RoleForm />
    </RequirePermission>
  );
}
