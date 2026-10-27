'use client';

import { useDeferredValue, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@erp/ui/components/badge';
import { Button } from '@erp/ui/components/button';
import { Input } from '@erp/ui/components/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@erp/ui/components/table';
import { useSetUserStatus, useUsers } from '../hooks';
import { CreateUserForm } from './create-user-form';
import { EditUserRoles } from './edit-user-roles';

export function UsersTable() {
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
              <TableHead>Roles</TableHead>
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
                  <div className="flex flex-wrap gap-1">
                    {user.roles.map((r) => (
                      <Badge key={r.id} variant="secondary">
                        {r.name}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={user.isActive ? 'default' : 'outline'}>{user.isActive ? 'Active' : 'Inactive'}</Badge>
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-2">
                    <EditUserRoles user={user} />
                    <Button
                      variant={user.isActive ? 'destructive' : 'outline'}
                      size="sm"
                      disabled={setStatus.isPending}
                      onClick={() => toggle(user.id, !user.isActive)}
                    >
                      {user.isActive ? 'Deactivate' : 'Activate'}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
    </div>
  );
}
