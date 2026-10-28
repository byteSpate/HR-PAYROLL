'use client';

import { useState } from 'react';
import { exitReasons } from '@erp/contracts/employee';
import { Button } from '@erp/ui/components/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@erp/ui/components/dialog';
import { Input } from '@erp/ui/components/input';
import { Label } from '@erp/ui/components/label';
import { useRecordExit } from '../hooks';
import { humanize } from '../labels';

export function ExitDialog({ employeeId }: { employeeId: string }) {
  const record = useRecordExit();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    setError(null);
    try {
      await record.mutateAsync({
        id: employeeId,
        body: {
          lastWorkingDay: String(f.get('lastWorkingDay')),
          exitReason: String(f.get('exitReason')),
          exitNote: String(f.get('exitNote') ?? '') || undefined,
        },
      });
      setOpen(false);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="destructive" />}>Record exit</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record exit</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="lastWorkingDay">Last working day</Label>
            <Input id="lastWorkingDay" name="lastWorkingDay" type="date" required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="exitReason">Reason</Label>
            <select id="exitReason" name="exitReason" className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm">
              {exitReasons.map((r) => (
                <option key={r} value={r}>
                  {humanize(r)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="exitNote">Note (optional)</Label>
            <Input id="exitNote" name="exitNote" maxLength={500} />
          </div>
          <p className="text-sm text-muted-foreground">A last working day in the past signs them out at once.</p>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" variant="destructive" disabled={record.isPending}>
            {record.isPending ? 'Saving...' : 'Record exit'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
