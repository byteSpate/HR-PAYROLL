'use client';

import Link from 'next/link';
import { Badge } from '@erp/ui/components/badge';
import { buttonVariants } from '@erp/ui/components/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@erp/ui/components/table';
import { cn } from '@erp/ui/lib/cn';
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
              </Link>{' '}
              {role.isSystem ? <Badge variant="outline">System</Badge> : null}
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
      <div className="mb-4 flex items-center">
        <h1 className="font-heading text-2xl font-bold tracking-tight">Roles &amp; Permissions</h1>
        <Link href="/settings/roles/new" className={cn(buttonVariants(), 'ml-auto')}>
          New role
        </Link>
      </div>
      <RolesList />
    </RequirePermission>
  );
}
