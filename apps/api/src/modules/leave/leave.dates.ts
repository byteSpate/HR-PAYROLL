import { formatDateOnly } from '@erp/export';

export type LeaveSession = 'FIRST_HALF' | 'SECOND_HALF';
export interface ChargedDaysInput {
  start: Date;
  end: Date;
  startSession: LeaveSession;
  endSession: LeaveSession;
  countsHolidays: boolean;
  weeklyOffDays: number[];
  holidays: Date[];
  workingDayOverrides: Date[];
}
export function countChargedDays(input: ChargedDaysInput): number {
  if (input.start > input.end) return 0;
  const holidays = new Set(input.holidays.map(formatDateOnly));
  const overrides = new Set(input.workingDayOverrides.map(formatDateOnly));
  let total = 0;
  for (let at = input.start.getTime(); at <= input.end.getTime(); at += 86400000) {
    const date = new Date(at);
    const key = formatDateOnly(date);
    const chargeable = input.countsHolidays || overrides.has(key) || (!holidays.has(key) && !input.weeklyOffDays.includes(date.getUTCDay()));
    if (!chargeable) continue;
    let fraction = 1;
    if (at === input.start.getTime() && input.startSession === 'SECOND_HALF') fraction -= 0.5;
    if (at === input.end.getTime() && input.endSession === 'FIRST_HALF') fraction -= 0.5;
    total += fraction;
  }
  return total;
}
