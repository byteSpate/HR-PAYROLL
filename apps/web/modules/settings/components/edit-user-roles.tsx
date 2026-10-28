'use client';

import { useState } from 'react';
import type { PublicUser } from '@erp/contracts/core';
import { Button } from '@erp/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@erp/ui/components/dialog';
import { useSetUserRole } from '../hooks';
import { RoleSelect } from './role-select';

export function EditUserRoles({ user }: { user: PublicUser }) {
  const save = useSetUserRole();
  const [open, setOpen] = useState(false);
  const [roleId, setRoleId] = useState<string | null>(user.role?.id ?? null);
  const [error, setError] = useState<string | null>(null);

  async function onSave() {
    setError(null);
    try {
      await save.mutateAsync({ id: user.id, roleId });
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the role.');
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setRoleId(user.role?.id ?? null);
          setError(null);
        }
      }}
    >
      <DialogTrigger render={<Button variant="outline" size="sm" />}>Roles</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Role for {user.displayName}</DialogTitle>
          <DialogDescription>{user.email}</DialogDescription>
        </DialogHeader>
        <RoleSelect value={roleId} onChange={setRoleId} />
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <Button onClick={onSave} disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save role'}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
