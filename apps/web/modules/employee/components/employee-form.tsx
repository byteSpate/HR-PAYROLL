'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { employmentTypes } from '@erp/contracts/employee';
import { Button } from '@erp/ui/components/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@erp/ui/components/dialog';
import { Input } from '@erp/ui/components/input';
import { Label } from '@erp/ui/components/label';
import { useDepartments } from '@/modules/department/hooks';
import { useCreateEmployee, useEmployees } from '../hooks';
import { humanize } from '../labels';

const selectClass = 'h-8 w-full rounded-md border border-input bg-background px-2 text-sm';

export function EmployeeForm() {
  const router = useRouter();
  const create = useCreateEmployee();
  const departments = useDepartments();
  const managers = useEmployees('');
  const [error, setError] = useState<string | null>(null);
  // Shown once, then gone: the server never returns it again.
  const [created, setCreated] = useState<{ id: string; password: string } | null>(null);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const text = (k: string) => String(f.get(k) ?? '').trim();
    setError(null);
    try {
      const res = await create.mutateAsync({
        email: text('email'),
        fullName: text('fullName'),
        designation: text('designation'),
        departmentId: text('departmentId'),
        reportingManagerId: text('reportingManagerId') || null,
        employmentType: text('employmentType') as (typeof employmentTypes)[number],
        joiningDate: text('joiningDate'),
        ...(text('employeeCode') ? { employeeCode: text('employeeCode') } : {}),
      });
      setCreated({ id: res.employee.id, password: res.temporaryPassword });
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <>
      <form onSubmit={submit} className="grid max-w-2xl gap-4 sm:grid-cols-2">
        <Field label="Full name" name="fullName" required />
        <Field label="Email" name="email" type="email" required />
        <Field label="Designation" name="designation" required />
        <Field label="Employee code (optional)" name="employeeCode" placeholder="EMP-0001 if left blank" />
        <div className="space-y-1">
          <Label htmlFor="departmentId">Department</Label>
          <select id="departmentId" name="departmentId" required className={selectClass} defaultValue="">
            <option value="" disabled>
              Choose a department
            </option>
            {departments.data?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="reportingManagerId">Reporting manager</Label>
          <select id="reportingManagerId" name="reportingManagerId" className={selectClass} defaultValue="">
            <option value="">None</option>
            {managers.data?.map((m) => (
              <option key={m.id} value={m.id}>
                {m.work.fullName}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="employmentType">Employment type</Label>
          <select id="employmentType" name="employmentType" className={selectClass} defaultValue="FULL_TIME">
            {employmentTypes.map((t) => (
              <option key={t} value={t}>
                {humanize(t)}
              </option>
            ))}
          </select>
        </div>
        <Field label="Joining date" name="joiningDate" type="date" required />
        {error ? <p className="text-sm text-destructive sm:col-span-2">{error}</p> : null}
        <div className="sm:col-span-2">
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? 'Saving...' : 'Add employee'}
          </Button>
        </div>
      </form>

      <Dialog open={created !== null} onOpenChange={() => undefined} disablePointerDismissal>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Employee added</DialogTitle>
            <DialogDescription>
              Give them this temporary password. It is shown only once, and they must change it when they first sign in.
            </DialogDescription>
          </DialogHeader>
          <p className="rounded-md bg-muted p-3 font-mono text-lg">{created?.password}</p>
          <Button onClick={() => created && router.push(`/employees/${created.id}`)}>Done</Button>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Field({ label, name, ...input }: { label: string; name: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="space-y-1">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} {...input} />
    </div>
  );
}
