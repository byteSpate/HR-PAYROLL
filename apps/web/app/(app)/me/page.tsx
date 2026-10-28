'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@erp/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@erp/ui/components/card';
import { Input } from '@erp/ui/components/input';
import { PageHeader } from '@erp/ui/page';
import { EmployeeProfileView } from '@/modules/employee/components/employee-profile';
import { useMe, useRequestIdChange, useSetAvatar, useUpdateEmployee } from '@/modules/employee/hooks';

export default function MyProfilePage() {
  const me = useMe();
  const update = useUpdateEmployee();
  const avatar = useSetAvatar();
  const requestId = useRequestIdChange();
  const [nationalId, setNationalId] = useState('');

  if (me.isPending) return <p className="text-sm text-muted-foreground">Loading...</p>;
  if (me.error) return <p className="text-sm text-muted-foreground">{me.error.message}</p>;
  const employee = me.data;

  return (
    <div className="space-y-6">
      <PageHeader kicker="My Space" title="My profile" />
      <EmployeeProfileView
        employee={employee}
        saving={update.isPending}
        error={update.error?.message ?? null}
        onSave={(patch) => update.mutate({ id: employee.id, patch }, { onSuccess: () => toast.success('Saved') })}
      />

      <Card>
        <CardHeader>
          <CardTitle>Profile photo</CardTitle>
        </CardHeader>
        <CardContent>
          <Input
            type="file"
            accept=".jpg,.jpeg,.png,.webp"
            className="max-w-xs"
            disabled={avatar.isPending}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              avatar.mutateAsync({ id: employee.id, file }).then(() => toast.success('Photo updated'), (err: Error) => toast.error(err.message));
              e.target.value = '';
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Change national ID</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">HR checks the new number before it replaces the current one.</p>
          <form
            className="flex max-w-md gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              requestId.mutateAsync(nationalId.trim()).then(
                () => {
                  setNationalId('');
                  toast.success('Request sent to HR');
                },
                (err: Error) => toast.error(err.message),
              );
            }}
          >
            <Input value={nationalId} onChange={(e) => setNationalId(e.target.value)} placeholder="New national ID" maxLength={30} required />
            <Button type="submit" disabled={requestId.isPending || nationalId.trim() === ''}>
              Send
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
