'use client';

import { useParams } from 'next/navigation';
import { PageHeader } from '@erp/ui/page';
import { RequirePermission } from '@/modules/settings/components/require-permission';
import { RoleForm } from '@/modules/settings/components/role-form';
import { useRoles } from '@/modules/settings/hooks';

function EditRole() {
  const { id } = useParams<{ id: string }>();
  const { data, error, isPending } = useRoles();
  if (error) return <p className="text-sm text-destructive">{error.message}</p>;
  if (isPending) return <p className="text-sm text-muted-foreground">Loading role…</p>;

  const role = data.find((r) => r.id === id);
  if (!role) return <p className="text-sm text-muted-foreground">Role not found.</p>;
  // Keyed so navigating between roles never reuses another role's form state.
  return <RoleForm key={role.id} role={role} />;
}

export default function EditRolePage() {
  return (
    <RequirePermission permission="role.manage">
      <PageHeader kicker="Settings" title="Edit role" />
      <EditRole />
    </RequirePermission>
  );
}
