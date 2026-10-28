'use client';

import { can } from '@erp/auth/permissions';
import { PageHeader } from '@erp/ui/dashboard';
import { useSession } from '@/lib/session';
import { ApprovalsSection } from '@/modules/attendance/components/approvals-section';
import { RequirePermission } from '@/modules/settings/components/require-permission';

export default function AttendanceApprovalsPage() {
  const { user, accessToken } = useSession();
  return (
    <RequirePermission permission="attendance.approve:team">
      <PageHeader kicker="Attendance" title="Attendance Approvals" sub="Review and decide check-ins, hours, and exceptions" />
      {/* HR sees everyone's queue; a manager sees their own team's. */}
      <ApprovalsSection accessToken={accessToken} isHr={user !== null && can(user, 'attendance.approve:all')} />
    </RequirePermission>
  );
}
