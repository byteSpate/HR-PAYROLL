import { expect, it } from 'vitest';
import { exceptionsFor } from './attendance.exceptions.js';

it('distinguishes missing, shortfall, and automatically closed days', () => {
  const day = { isLate: true, isEarlyOut: false, autoCheckOutAt: null, checkOut: null, workedHours: null, expectedHours: 9, onApprovedLeave: false, isOffDay: false, regularisedAt: null, source: 'WEB' as const };
  expect(exceptionsFor(day)).toEqual(['LATE', 'MISSING_CHECKOUT']);
  expect(exceptionsFor({ ...day, checkOut: new Date(), workedHours: 3 })).toEqual(['LATE', 'SHORTFALL']);
  expect(exceptionsFor({ ...day, checkOut: new Date(), workedHours: 3, autoCheckOutAt: new Date() })).toEqual(['LATE', 'AUTO_CHECK_OUT']);
});
