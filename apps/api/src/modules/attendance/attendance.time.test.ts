import { describe, expect, it } from 'vitest';
import { computeIsEarlyOut, computeIsLate, officeDateOf } from './attendance.time.js';
import { DEFAULT_SHIFT } from './shift.service.js';

describe('attendance office time', () => {
  it('assigns a late UTC punch to the next Dhaka date', () => {
    expect(officeDateOf(new Date('2026-03-01T23:30:00Z')).toISOString()).toBe('2026-03-02T00:00:00.000Z');
  });
  it('applies the shift grace period to arrivals', () => {
    expect(computeIsLate(new Date('2026-03-02T03:15:00Z'), DEFAULT_SHIFT)).toBe(false);
    expect(computeIsLate(new Date('2026-03-02T03:16:00Z'), DEFAULT_SHIFT)).toBe(true);
  });
  it('does not flag departure on the following office date as early', () => {
    const date = new Date('2026-03-02T00:00:00Z');
    expect(computeIsEarlyOut(new Date('2026-03-02T11:30:00Z'), date, DEFAULT_SHIFT)).toBe(true);
    expect(computeIsEarlyOut(new Date('2026-03-02T18:30:00Z'), date, DEFAULT_SHIFT)).toBe(false);
  });
});
