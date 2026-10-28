'use client';

import Link from 'next/link';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@erp/ui/components/table';
import { PageHeader } from '@erp/ui/page';
import { useRoles } from '@/modules/settings/hooks';
import { RequirePermission } from '@/modules/settings/components/require-permission';

function RolesList() {
  const { data, error, isPending } = useRoles();
  if (error) return <p className="text-sm text-destructive">{error.message}</p>;
  if (isPending) return <p className="text-sm text-muted-foreground">Loading roles…</p>;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Role</TableHead>
          <TableHead>Description</TableHead>
          <TableHead>Permissions</TableHead>
          <TableHead>Users</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((role) => (
          <TableRow key={role.id}>
            <TableCell className="font-medium">
              <Link href={`/settings/roles/${role.id}`} className="underline-offset-4 hover:underline">
                {role.name}
              </Link>
            </TableCell>
            <TableCell>{role.description}</TableCell>
            <TableCell>{role.permissions.length}</TableCell>
            <TableCell>{role.userCount}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default function RolesPage() {
  return (
    <RequirePermission permission="role.manage">
      <PageHeader kicker="Settings" title="Roles & permissions" cta="New role" ctaHref="/settings/roles/new" />
      <RolesList />
    </RequirePermission>
  );
}
