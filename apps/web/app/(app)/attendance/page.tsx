'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { can } from '@erp/auth/permissions';
import { PageHeader } from '@erp/ui/dashboard';
import { useSession } from '@/lib/session';
import { getMonthlySummary } from '@/modules/attendance/api';
import { DailyBoard, MonthlyTable } from '@/modules/attendance/components/org-sections';
import { PeriodStepper, usePeriod } from '@/modules/attendance/components/period-stepper';
import { RequirePermission } from '@/modules/settings/components/require-permission';

export default function TodaysAttendancePage() {
  const { accessToken, user, status } = useSession();
  const queryClient = useQueryClient();
  const period = usePeriod();
  const authed = status === 'authenticated';

  const summaryQuery = useQuery({
    queryKey: ['attendance', 'monthly', period.year, period.month],
    queryFn: () => getMonthlySummary(accessToken, period.month, period.year),
    enabled: authed,
  });

  // A decision or a correction changes every derived day, so the whole prefix goes rather than one key.
  const invalidateAll = useCallback(() => queryClient.invalidateQueries({ queryKey: ['attendance'] }), [queryClient]);

  return (
    <RequirePermission permission="attendance.read:team">
      <PageHeader
        kicker="Attendance"
        title="Today's Attendance"
        sub="Who is in today, and the month so far"
        aside={<PeriodStepper {...period} />}
      />
      <DailyBoard accessToken={accessToken} />
      <MonthlyTable
        accessToken={accessToken}
        month={period.month}
        year={period.year}
        summaries={summaryQuery.data ?? []}
        pending={summaryQuery.isPending}
        isError={summaryQuery.isError}
        onRetry={() => summaryQuery.refetch()}
        // Corrections and manual records are the HR tools; a manager reads the table.
        isHr={user !== null && can(user, 'attendance.manage:department')}
        onChanged={invalidateAll}
      />
    </RequirePermission>
  );
}
