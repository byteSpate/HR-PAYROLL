export interface EvaluatedDay {
  isLate: boolean;
  isEarlyOut: boolean;
  autoCheckOutAt: Date | null;
  checkOut: Date | null;
  workedHours: number | null;
  expectedHours: number;
  onApprovedLeave: boolean;
  isOffDay: boolean;
  regularisedAt: Date | null;
  source: 'WEB' | 'MANUAL';
}
export type ExceptionCode = 'LATE' | 'EARLY_OUT' | 'AUTO_CHECK_OUT' | 'MISSING_CHECKOUT' | 'SHORTFALL' | 'LEAVE_CONFLICT' | 'WORKED_OFF_DAY' | 'REGULARISED' | 'MANUAL_ENTRY';
export function exceptionsFor(day: EvaluatedDay): ExceptionCode[] {
  const result: ExceptionCode[] = [];
  if (day.isLate) result.push('LATE');
  if (day.isEarlyOut) result.push('EARLY_OUT');
  if (day.autoCheckOutAt) result.push('AUTO_CHECK_OUT');
  else if (!day.checkOut) result.push('MISSING_CHECKOUT');
  else if (day.workedHours !== null && day.workedHours < day.expectedHours) result.push('SHORTFALL');
  if (day.onApprovedLeave) result.push('LEAVE_CONFLICT');
  if (day.isOffDay) result.push('WORKED_OFF_DAY');
  if (day.regularisedAt) result.push('REGULARISED');
  if (day.source === 'MANUAL') result.push('MANUAL_ENTRY');
  return result;
}
