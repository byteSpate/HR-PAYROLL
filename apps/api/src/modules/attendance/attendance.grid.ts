import { monthString } from '@erp/contracts/attendance';
import { formatDateOnly, officeToday } from '@erp/export';
import { prisma, type Prisma } from '@erp/db';
import { effectiveShift } from './shift.service.js';

export type ScopeFilter = Prisma.EmployeeWhereInput;
export type DayStatus = 'present' | 'late' | 'absent' | 'leave' | 'holiday' | 'off' | 'future';
export type LeaveDaysFor = (employeeIds: string[], month: string) => Promise<Map<string, Set<string>>>;

export async function dailyGrid(scope: ScopeFilter, month: string, leaveDaysFor: LeaveDaysFor = async () => new Map()) {
  monthString.parse(month);
  const start = new Date(`${month}-01T00:00:00.000Z`);
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  const [employees, holidays, shifts] = await Promise.all([
    prisma.employee.findMany({ where: scope, include: { shift: true, department: true, attendances: { where: { date: { gte: start, lt: end } } } }, orderBy: { fullName: 'asc' } }),
    prisma.holiday.findMany({ where: { date: { gte: start, lt: end } } }),
    prisma.shift.findMany(),
  ]);
  const leave = await leaveDaysFor(employees.map(e => e.id), month);
  const today = officeToday();
  return employees.map(employee => {
    const days: { date: string; status: DayStatus }[] = [];
    for (let at = start.getTime(); at < end.getTime(); at += 86400000) {
      const day = new Date(at);
      const key = formatDateOnly(day);
      const punch = employee.attendances.find(a => a.date.getTime() === at);
      const dayHolidays = holidays.filter(h => h.date.getTime() === at);
      const working = dayHolidays.some(h => h.type === 'WORKING_DAY');
      const holiday = !working && dayHolidays.some(h => h.type !== 'WORKING_DAY');
      const shift = effectiveShift(day, employee.shift, shifts);
      const off = !working && shift.weeklyOffDays.includes(day.getUTCDay());
      let status: DayStatus;
      if (punch?.checkIn) status = punch.isLate ? 'late' : 'present';
      else if (leave.get(employee.id)?.has(key)) status = 'leave';
      else if (holiday) status = 'holiday';
      else if (off) status = 'off';
      else if (day > today || day < employee.joiningDate || (employee.lastWorkingDay && day > employee.lastWorkingDay)) status = 'future';
      else status = 'absent';
      days.push({ date: key, status });
    }
    return { employeeId: employee.id, employeeCode: employee.employeeCode, fullName: employee.fullName, department: employee.department.name, days };
  });
}

export async function monthlySummary(scope: ScopeFilter, month: string, leaveDaysFor?: LeaveDaysFor) {
  const grid = await dailyGrid(scope, month, leaveDaysFor);
  return grid.map(({ days, ...employee }) => ({ ...employee, ...Object.fromEntries((['present', 'late', 'absent', 'leave', 'holiday', 'off', 'future'] as const).map(status => [status, days.filter(day => day.status === status).length])) }));
}
