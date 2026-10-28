'use client';

import { PageHeader } from '@erp/ui/page';
import { EmployeeTable } from '@/modules/employee/components/employee-table';
import { useMyTeam } from '@/modules/employee/hooks';
import { RequirePermission } from '@/modules/settings/components/require-permission';

export default function MyTeamPage() {
  const team = useMyTeam();
  return (
    <RequirePermission permission="employee.read:team">
      <PageHeader kicker="Employees" title="My team" />
      <EmployeeTable rows={team.data} loading={team.isPending} error={team.error?.message ?? null} empty="Nobody reports to you." />
    </RequirePermission>
  );
}
