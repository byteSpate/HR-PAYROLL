'use client';

import { useState } from 'react';
import { PageHeader } from '@erp/ui/page';
import { IdRequestTable } from '@/modules/employee/components/id-request-table';
import { RequirePermission } from '@/modules/settings/components/require-permission';

const STATUSES = ['PENDING', 'APPROVED', 'REJECTED', ''] as const;

export default function IdRequestsPage() {
  const [status, setStatus] = useState<string>('PENDING');
  return (
    <RequirePermission permission="employee.id_request.decide:department">
      <PageHeader kicker="Employees" title="ID change requests" />
      <select
        aria-label="Status"
        value={status}
        onChange={(e) => setStatus(e.target.value)}
        className="mb-4 h-8 rounded-md border border-input bg-background px-2 text-sm"
      >
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {s ? s.charAt(0) + s.slice(1).toLowerCase() : 'All'}
          </option>
        ))}
      </select>
      <IdRequestTable status={status} />
    </RequirePermission>
  );
}
