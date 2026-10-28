'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { PageHeader } from '@erp/ui/dashboard';
import { useSession } from '@/lib/session';
import { listHolidays } from '@/modules/attendance/api';
import { PeriodStepper, usePeriod } from '@/modules/attendance/components/period-stepper';
import { HolidayPanel } from '@/modules/attendance/components/org-sections';
import { RequirePermission } from '@/modules/settings/components/require-permission';

export default function HolidayCalendarPage() {
  const { accessToken, status } = useSession();
  const queryClient = useQueryClient();
  const period = usePeriod();

  const holidaysQuery = useQuery({
    queryKey: ['holidays', period.year],
    queryFn: () => listHolidays(accessToken, period.year),
    enabled: status === 'authenticated',
  });

  // A holiday changes every derived day, so the whole prefix goes rather than one key.
  const invalidateAll = useCallback(() => queryClient.invalidateQueries({ queryKey: ['attendance'] }), [queryClient]);

  return (
    <RequirePermission permission="attendance.config">
      <PageHeader
        kicker="Attendance"
        title="Holiday Calendar"
        sub="Gazetted days and working-day overrides"
        aside={<PeriodStepper {...period} />}
      />
      <HolidayPanel accessToken={accessToken} year={period.year} holidays={holidaysQuery.data ?? []} onChanged={invalidateAll} />
    </RequirePermission>
  );
}
