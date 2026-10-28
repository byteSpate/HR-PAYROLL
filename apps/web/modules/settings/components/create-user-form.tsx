'use client';

import { RiAddLine } from '@remixicon/react';
import { useState } from 'react';
import { Button } from '@erp/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@erp/ui/components/dialog';
import { Input } from '@erp/ui/components/input';
import { Label } from '@erp/ui/components/label';
import { useCreateUser } from '../hooks';
import { RoleSelect } from './role-select';

export function CreateUserForm() {
  const create = useCreateUser();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [roleId, setRoleId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Held in component state only: the server never returns it again.
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);

  function onOpenChange(next: boolean) {
    // The temporary password is shown once; only the explicit Done button may close the dialog then.
    if (!next && temporaryPassword) return;
    setOpen(next);
    if (!next) {
      setEmail('');
      setDisplayName('');
      setRoleId(null);
      setError(null);
      setTemporaryPassword(null);
      create.reset();
    }
  }

  function closeAfterPassword() {
    setTemporaryPassword(null);
    onOpenChange(false);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const result = await create.mutateAsync({ email: email.trim(), displayName: displayName.trim(), roleId });
      setTemporaryPassword(result.temporaryPassword);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the user.');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} disablePointerDismissal={!!temporaryPassword}>
      <DialogTrigger render={<Button />}>
        <RiAddLine />
        New user
      </DialogTrigger>
      <DialogContent showCloseButton={!temporaryPassword}>
        {temporaryPassword ? (
          <>
            <DialogHeader>
              <DialogTitle>User created</DialogTitle>
              <DialogDescription>
                Share this temporary password with {email.trim()}. It is shown only once and must be changed at first sign-in.
              </DialogDescription>
            </DialogHeader>
            <code className="rounded-md bg-muted px-3 py-2 font-mono text-base select-all">{temporaryPassword}</code>
            <Button onClick={closeAfterPassword}>Done</Button>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>New user</DialogTitle>
              <DialogDescription>A temporary password is generated for the new account.</DialogDescription>
            </DialogHeader>
            <form onSubmit={onSubmit} className="grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="nu-email">Email</Label>
                <Input id="nu-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="nu-name">Display name</Label>
                <Input id="nu-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
              </div>
              <div className="grid gap-1.5">
                <span className="text-sm font-medium">Role</span>
                <RoleSelect value={roleId} onChange={setRoleId} />
              </div>
              {error ? (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              ) : null}
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? 'Creating…' : 'Create user'}
              </Button>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
