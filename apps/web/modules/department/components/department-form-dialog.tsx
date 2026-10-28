'use client';

import { useState, type ReactElement } from 'react';
import { Button } from '@erp/ui/components/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@erp/ui/components/dialog';
import { Input } from '@erp/ui/components/input';
import { Label } from '@erp/ui/components/label';

/** Create (no `initialName`) or rename a department; the API message is shown on failure. */
export function DepartmentFormDialog({
  trigger,
  title,
  initialName = '',
  onSave,
}: {
  trigger: ReactElement;
  title: string;
  initialName?: string;
  onSave: (name: string) => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    setName(initialName);
    setError(null);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSave(name);
      setOpen(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="department-name">Name</Label>
            <Input id="department-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" disabled={saving || name.trim() === ''}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
