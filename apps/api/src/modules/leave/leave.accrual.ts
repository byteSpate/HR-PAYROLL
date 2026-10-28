import { dailyGrid } from '../attendance/attendance.grid.js';
import { earnedAccrual } from './leave.policy.js';

export async function computeEarnedAccrual(employee: { id: string; joiningDate: Date }, asOf: Date, minServiceMonths: number, maxAccrual: number | null): Promise<number> {
  const serviceMonths = (asOf.getUTCFullYear() - employee.joiningDate.getUTCFullYear()) * 12 + asOf.getUTCMonth() - employee.joiningDate.getUTCMonth() - (asOf.getUTCDate() < employee.joiningDate.getUTCDate() ? 1 : 0);
  if (serviceMonths < minServiceMonths) return 0;
  const previousYear = new Date(Date.UTC(asOf.getUTCFullYear() - 1, asOf.getUTCMonth(), 1));
  const lastDay = new Date(Date.UTC(previousYear.getUTCFullYear(), previousYear.getUTCMonth() + 1, 0)).getUTCDate();
  previousYear.setUTCDate(Math.min(asOf.getUTCDate(), lastDay) + 1);
  const from = previousYear.toISOString().slice(0, 10);
  const to = asOf.toISOString().slice(0, 10);
  const months = Array.from({ length: 13 }, (_, i) => new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() - 12 + i, 1)).toISOString().slice(0, 7));
  const grids = await Promise.all(months.map(month => dailyGrid({ id: employee.id }, month)));
  const worked = grids.flatMap(grid => grid[0]?.days ?? []).filter(day => day.date >= from && day.date <= to && (day.status === 'present' || day.status === 'late')).length;
  return earnedAccrual(worked, employee.joiningDate, asOf, minServiceMonths, maxAccrual);
}
