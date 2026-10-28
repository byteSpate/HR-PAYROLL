'use client';

import { PageHeader } from '@erp/ui/dashboard';
import { useSession } from '@/lib/session';
import { AttendanceReports } from '@/modules/attendance/components/report-panel';
import { RequirePermission } from '@/modules/settings/components/require-permission';

export default function AttendanceReportsPage() {
  const { accessToken } = useSession();
  return (
    <RequirePermission permission="attendance.report:team">
      <PageHeader kicker="Attendance" title="Reports" sub="Attendance for any range, on screen or as a file" />
      <AttendanceReports accessToken={accessToken} />
    </RequirePermission>
  );
}
