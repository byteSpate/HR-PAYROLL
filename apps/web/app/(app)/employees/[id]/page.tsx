'use client';

import { use } from 'react';
import { EmployeeDetailPage } from '@/modules/people/components/employee-detail-page';
import { RequirePermission } from '@/modules/settings/components/require-permission';

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <RequirePermission permission={['employee.read:department', 'employee.read.financial']}>
      <EmployeeDetailPage employeeId={id} backHref="/employees" />
    </RequirePermission>
  );
}
