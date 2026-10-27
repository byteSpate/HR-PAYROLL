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
import { useSetUserRoles } from '../hooks';
import { RoleSelect } from './role-select';

export function EditUserRoles({ user }: { user: PublicUser }) {
  const save = useSetUserRoles();
  const [open, setOpen] = useState(false);
  const [roleIds, setRoleIds] = useState(user.roles.map((r) => r.id));
  const [error, setError] = useState<string | null>(null);

  async function onSave() {
    setError(null);
    try {
      await save.mutateAsync({ id: user.id, roleIds });
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update roles.');
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setRoleIds(user.roles.map((r) => r.id));
          setError(null);
        }
      }}
    >
      <DialogTrigger render={<Button variant="outline" size="sm" />}>Roles</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Roles for {user.displayName}</DialogTitle>
          <DialogDescription>{user.email}</DialogDescription>
        </DialogHeader>
        <RoleSelect value={roleIds} onChange={setRoleIds} />
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <Button onClick={onSave} disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save roles'}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
