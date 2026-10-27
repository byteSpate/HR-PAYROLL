'use client';

import { useState } from 'react';
import { changePasswordSchema } from '@erp/contracts/core';
import { Button } from '@erp/ui/components/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@erp/ui/components/dialog';
import { Label } from '@erp/ui/components/label';
import { PasswordInput } from '@erp/ui/components/password-input';
import { useSession } from '@/lib/session';
import { changePassword } from '../api';

// Blocking: no close button and no dismissal, because the temporary password must be replaced before anything else.
export function ChangePasswordDialog() {
  const { setUser } = useSession();
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = changePasswordSchema.safeParse({ currentPassword, newPassword });
    if (!parsed.success) return setError('The new password must be at least 8 characters.');
    if (newPassword !== confirm) return setError('The new passwords do not match.');
    setBusy(true);
    try {
      const { user } = await changePassword(parsed.data);
      setUser(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change the password.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={() => undefined} disablePointerDismissal>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Set a new password</DialogTitle>
          <DialogDescription>Your account uses a temporary password. Choose a new one to continue.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="cp-current">Temporary password</Label>
            <PasswordInput id="cp-current" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrent(e.target.value)} required />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="cp-new">New password</Label>
            <PasswordInput id="cp-new" autoComplete="new-password" value={newPassword} onChange={(e) => setNew(e.target.value)} required />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="cp-confirm">Confirm new password</Label>
            <PasswordInput id="cp-confirm" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          </div>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <Button type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Change password'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
