'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { roleSchema } from '@erp/contracts/core';
import { Button } from '@erp/ui/components/button';
import { Input } from '@erp/ui/components/input';
import { Label } from '@erp/ui/components/label';
import type { RoleGrant, RoleView } from '../api';
import { useCreateRole, useDeleteRole, useUpdateRole } from '../hooks';
import { PermissionPicker } from './permission-picker';

export function RoleForm({ role }: { role?: RoleView }) {
  const router = useRouter();
  const create = useCreateRole();
  const update = useUpdateRole();
  const remove = useDeleteRole();
  const [name, setName] = useState(role?.name ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [permissions, setPermissions] = useState<RoleGrant[]>(role?.permissions ?? []);
  const [error, setError] = useState<string | null>(null);

  const busy = create.isPending || update.isPending || remove.isPending;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const body = { name: name.trim(), description: description.trim() || undefined, permissions };
    if (!roleSchema.safeParse(body).success || !body.name) return setError('A role name is required.');
    try {
      if (role) await update.mutateAsync({ id: role.id, ...body });
      else await create.mutateAsync(body);
      toast.success(role ? 'Role updated' : 'Role created');
      router.push('/settings/roles');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the role.');
    }
  }

  async function onDelete() {
    if (!role || !window.confirm(`Delete the role "${role.name}"?`)) return;
    setError(null);
    try {
      await remove.mutateAsync(role.id);
      toast.success('Role deleted');
      router.push('/settings/roles');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete the role.');
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid max-w-xl gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="role-name">Name</Label>
        <Input id="role-name" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="role-description">Description</Label>
        <Input id="role-description" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="grid gap-1.5">
        <span className="text-sm font-medium">Permissions</span>
        <PermissionPicker value={permissions} onChange={setPermissions} />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          {role ? 'Save changes' : 'Create role'}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push('/settings/roles')}>
          Cancel
        </Button>
        {role ? (
          <Button type="button" variant="destructive" className="ml-auto" disabled={busy} onClick={onDelete}>
            Delete
          </Button>
        ) : null}
      </div>
    </form>
  );
}
