import { dailyGrid } from '../attendance/attendance.grid.js';
import { earnedAccrual } from './leave.policy.js';
export async function computeEarnedAccrual(employee: { id: string; joiningDate: Date }, asOf: Date, minServiceMonths: number, maxAccrual: number | null): Promise<number> {
  const eligible = new Date(employee.joiningDate);
  eligible.setUTCMonth(eligible.getUTCMonth() + minServiceMonths);
  if (asOf < eligible) return 0;
  const months = Array.from({ length: 12 }, (_, i) => {
    const date = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() - 12 + i, 1));
    return date.toISOString().slice(0, 7);
  });
  const grids = await Promise.all(months.map(month => dailyGrid({ id: employee.id }, month)));
  const worked = grids.flatMap(grid => grid[0]?.days ?? []).filter(day => day.status === 'present' || day.status === 'late').length;
  return earnedAccrual(worked, employee.joiningDate, asOf, minServiceMonths, maxAccrual);
}
