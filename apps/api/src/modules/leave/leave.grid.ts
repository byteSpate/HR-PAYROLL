import { prisma } from '@erp/db';
import { monthString } from '@erp/contracts/attendance';
import { formatDateOnly } from '@erp/export';
export async function leaveDaysFor(employeeIds: string[], month: string): Promise<Map<string, Set<string>>> {
  monthString.parse(month);
  const start = new Date(`${month}-01T00:00:00.000Z`);
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  const requests = await prisma.leaveRequest.findMany({ where: { employeeId: { in: employeeIds }, status: 'APPROVED', startDate: { lt: end }, endDate: { gte: start } } });
  const result = new Map<string, Set<string>>();
  for (const row of requests) {
    const days = result.get(row.employeeId) ?? new Set<string>();
    for (let at = Math.max(start.getTime(), row.startDate.getTime()); at <= row.endDate.getTime() && at < end.getTime(); at += 86400000) days.add(formatDateOnly(new Date(at)));
    result.set(row.employeeId, days);
  }
  return result;
}
