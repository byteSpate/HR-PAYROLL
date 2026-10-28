'use client';

import { useDeferredValue, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@erp/ui/components/button';
import { Input } from '@erp/ui/components/input';
import { Tag } from '@erp/ui/page';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@erp/ui/components/table';
import type { PublicUser } from '@erp/contracts/core';
import { useSession } from '@/lib/session';
import { useSetUserAccessLevel, useSetUserStatus, useUsers } from '../hooks';
import { CreateUserForm } from './create-user-form';
import { EditUserRoles } from './edit-user-roles';

function accessLabel(user: PublicUser): string | null {
  if (user.accessLevel === 'SUPER_ADMIN') return 'Super admin';
  if (user.accessLevel === 'ADMIN') return 'Admin';
  return user.role?.name ?? null;
}

function AccessTag({ user }: { user: PublicUser }) {
  const label = accessLabel(user);
  if (!label) return <span className="text-sm text-muted-foreground">No role</span>;
  return <Tag label={label} tone={user.accessLevel === 'STANDARD' ? 'neutral' : 'info'} />;
}

export function UsersTable() {
  const { user: viewer } = useSession();
  const isSuperAdmin = viewer?.accessLevel === 'SUPER_ADMIN';
  const setAccess = useSetUserAccessLevel();
  const [search, setSearch] = useState('');
  const q = useDeferredValue(search.trim());
  const { data, error, isPending } = useUsers(q);
  const setStatus = useSetUserStatus();

  async function toggle(id: string, isActive: boolean) {
    try {
      await setStatus.mutateAsync({ id, isActive });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update the user.');
    }
  }

  async function changeAccess(id: string, accessLevel: 'ADMIN' | 'STANDARD') {
    try {
      await setAccess.mutateAsync({ id, accessLevel });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update the user.');
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-2">
        <Input
          aria-label="Search users"
          placeholder="Search by name or email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <div className="ml-auto">
          <CreateUserForm />
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">{error.message}</p> : null}
      {isPending ? <p className="text-sm text-muted-foreground">Loading users…</p> : null}

      {data ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Access</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No users found.
                </TableCell>
              </TableRow>
            ) : null}
            {data.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="font-medium">{user.displayName}</TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell>
                  <AccessTag user={user} />
                </TableCell>
                <TableCell>
                  <Tag label={user.isActive ? 'Active' : 'Inactive'} tone={user.isActive ? 'good' : 'neutral'} />
                </TableCell>
                <TableCell>
                  {/* The super admin row never has actions; admin rows only for the super admin. */}
                  {user.accessLevel === 'SUPER_ADMIN' || (user.accessLevel === 'ADMIN' && !isSuperAdmin) ? null : (
                    <div className="flex justify-end gap-2">
                      {user.accessLevel === 'STANDARD' ? <EditUserRoles user={user} /> : null}
                      {isSuperAdmin ? (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={setAccess.isPending}
                          onClick={() => changeAccess(user.id, user.accessLevel === 'ADMIN' ? 'STANDARD' : 'ADMIN')}
                        >
                          {user.accessLevel === 'ADMIN' ? 'Remove admin' : 'Make admin'}
                        </Button>
                      ) : null}
                      <Button
                        variant={user.isActive ? 'destructive' : 'outline'}
                        size="sm"
                        disabled={setStatus.isPending}
                        onClick={() => toggle(user.id, !user.isActive)}
                      >
                        {user.isActive ? 'Deactivate' : 'Activate'}
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
    </div>
  );
}
