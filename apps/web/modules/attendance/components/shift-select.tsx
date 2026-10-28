'use client';

import { useQuery } from '@tanstack/react-query';
import { Label } from '@erp/ui/components/label';
import * as api from '../api';

const selectClass = 'h-8 w-full rounded-md border border-input bg-background px-2 text-sm';
const DEFAULT_HOURS = 'Default hours (09:00-18:00)';

/**
 * The shift an employee works, as a form field named `shiftId`. Empty means the built-in default.
 * Dated overrides (Ramadan hours) are left out: they apply to everyone inside their window anyway.
 * If the list cannot load, the field still submits the default rather than blocking the hire.
 */
export function ShiftSelect() {
  const shifts = useQuery({ queryKey: ['attendance', 'shifts'], queryFn: () => api.configList('shifts') });
  const standing = shifts.data?.filter((s) => !s.effectiveFrom) ?? [];

  return (
    <div className="space-y-1">
      <Label htmlFor="shiftId">Shift</Label>
      <select id="shiftId" name="shiftId" className={selectClass} defaultValue="">
        <option value="">{DEFAULT_HOURS}</option>
        {standing.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name} ({s.startTime}-{s.endTime})
          </option>
        ))}
      </select>
    </div>
  );
}
