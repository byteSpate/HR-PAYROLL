'use client';

import { use } from 'react';
import { toast } from 'sonner';
import { can } from '@erp/auth/permissions';
import { Button } from '@erp/ui/components/button';
import { useSession } from '@/lib/session';
import { DocumentsPanel } from '@/modules/employee/components/documents-panel';
import { EmployeeProfileView } from '@/modules/employee/components/employee-profile';
import { ExitDialog } from '@/modules/employee/components/exit-dialog';
import { useEmployee, useSetAccount, useUpdateEmployee } from '@/modules/employee/hooks';

export default function EmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useSession();
  const employee = useEmployee(id);
  const update = useUpdateEmployee();
  const account = useSetAccount();

  if (employee.isPending) return <p className="text-sm text-muted-foreground">Loading...</p>;
  if (employee.error) return <p className="text-sm text-destructive">{employee.error.message}</p>;

  // UX hints only; the API decides with the viewer's real scope on every call.
  const canExit = !!user && can(user, 'employee.exit:department');
  const canUpdate = !!user && can(user, 'employee.update:department');
  const canManageDocs = !!user && can(user, 'employee.documents.manage:department');
  const status = employee.data.employment?.employmentStatus;

  return (
    <div className="space-y-6">
      <EmployeeProfileView
        employee={employee.data}
        saving={update.isPending}
        error={update.error?.message ?? null}
        onSave={(patch) => update.mutate({ id, patch }, { onSuccess: () => toast.success('Saved') })}
      />
      <DocumentsPanel employeeId={id} canManage={canManageDocs} canSee={!!employee.data.personal} />
      <div className="flex flex-wrap gap-2">
        {canExit && (status === 'ACTIVE' || status === 'ON_LEAVE') ? <ExitDialog employeeId={id} /> : null}
        {canUpdate ? (
          <>
            <Button
              variant="outline"
              onClick={() => account.mutateAsync({ id, isActive: false }).then(() => toast.success('Sign-in disabled'), (e: Error) => toast.error(e.message))}
            >
              Disable sign-in
            </Button>
            <Button
              variant="outline"
              onClick={() => account.mutateAsync({ id, isActive: true }).then(() => toast.success('Sign-in enabled'), (e: Error) => toast.error(e.message))}
            >
              Enable sign-in
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}
