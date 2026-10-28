import { expect, it, vi } from 'vitest';
vi.mock('../attendance/attendance.grid.js', () => ({ dailyGrid: vi.fn(async (_scope: unknown, month: string) => [{ days: Array.from({ length: 18 }, (_, i) => ({ date: `${month}-${String(i + 1).padStart(2, '0')}`, status: 'present' })) }]) }));
import { computeEarnedAccrual } from './leave.accrual.js';
it('grants earned leave only after minimum service and counts worked days', async () => {
  const employee = { id: 'e', joiningDate: new Date('2025-01-01T00:00:00Z') };
  expect(await computeEarnedAccrual(employee, new Date('2025-06-01T00:00:00Z'), 12, 60)).toBe(0);
  expect(await computeEarnedAccrual(employee, new Date('2026-01-01T00:00:00Z'), 12, 60)).toBe(12);
});
it('counts only work within the rolling twelve-month window including the current month', async () => {
  const { dailyGrid } = await import('../attendance/attendance.grid.js');
  vi.mocked(dailyGrid).mockImplementation(async (_scope, month) => [{ employeeId: 'e', employeeCode: 'E', fullName: 'E', department: 'D', days: month === '2026-10' ? Array.from({ length: 18 }, (_, i) => ({ date: `2026-10-${String(i + 1).padStart(2, '0')}`, status: 'present' as const })) : [{ date: `${month}-01`, status: 'absent' as const }] }]);
  expect(await computeEarnedAccrual({ id: 'e', joiningDate: new Date('2024-01-01T00:00:00Z') }, new Date('2026-10-20T00:00:00Z'), 12, 60)).toBe(1);
});
