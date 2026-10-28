import { describe, expect, it } from 'vitest';
import { countChargedDays } from './leave.dates.js';
const date = (s: string) => new Date(`${s}T00:00:00Z`);
const base = { start: date('2026-03-05'), end: date('2026-03-07'), startSession: 'FIRST_HALF' as const, endSession: 'SECOND_HALF' as const, weeklyOffDays: [5], holidays: [date('2026-03-07')], workingDayOverrides: [] };
describe('leave charged days', () => {
  it('includes or excludes holidays and weekly off days by policy', () => {
    expect(countChargedDays({ ...base, countsHolidays: true })).toBe(3);
    expect(countChargedDays({ ...base, countsHolidays: false })).toBe(1);
  });
  it('charges half-day boundaries', () => {
    expect(countChargedDays({ ...base, countsHolidays: true, startSession: 'SECOND_HALF' })).toBe(2.5);
    expect(countChargedDays({ ...base, end: base.start, countsHolidays: false, endSession: 'FIRST_HALF' })).toBe(0.5);
  });
  it('counts a working-day override on a weekly off day', () => {
    expect(countChargedDays({ ...base, start: date('2026-03-06'), end: date('2026-03-06'), countsHolidays: false, workingDayOverrides: [date('2026-03-06')] })).toBe(1);
  });
});
