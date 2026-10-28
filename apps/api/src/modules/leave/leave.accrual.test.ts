import { expect, it, vi } from 'vitest';
vi.mock('../attendance/attendance.grid.js', () => ({ dailyGrid: vi.fn(async () => [{ days: Array.from({ length: 18 }, () => ({ status: 'present' })) }]) }));
import { computeEarnedAccrual } from './leave.accrual.js';
it('grants earned leave only after minimum service and counts worked days', async () => {
  const employee = { id: 'e', joiningDate: new Date('2025-01-01T00:00:00Z') };
  expect(await computeEarnedAccrual(employee, new Date('2025-06-01T00:00:00Z'), 12, 60)).toBe(0);
  expect(await computeEarnedAccrual(employee, new Date('2026-01-01T00:00:00Z'), 12, 60)).toBe(12);
});
