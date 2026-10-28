'use client';

import { EmployeeTable } from '@/modules/employee/components/employee-table';
import { useMyTeam } from '@/modules/employee/hooks';
import { RequirePermission } from '@/modules/settings/components/require-permission';

export default function MyTeamPage() {
  const team = useMyTeam();
  return (
    <RequirePermission permission="employee.read:team">
      <h1 className="mb-4 font-heading text-2xl font-bold tracking-tight">My Team</h1>
      <EmployeeTable rows={team.data} loading={team.isPending} error={team.error?.message ?? null} empty="Nobody reports to you." />
    </RequirePermission>
  );
}
