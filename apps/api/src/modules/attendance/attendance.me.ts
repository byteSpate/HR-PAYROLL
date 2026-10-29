import type { AttendanceDay, MonthlyAttendanceSummary, TodayAttendance } from '@erp/contracts/attendance';
import { prisma } from '@erp/db';
import { formatDateOnly } from '@erp/export';
import { AppError } from '@erp/utils';
import { buildDayGrid, halfDayShift, resolveShift, shiftInfo } from './attendance.derive.js';
import { monthRange, resolveRange } from './attendance.range.js';
import { summariseDays, toGridEmployee, toRef } from './attendance.summary.js';
import { elapsedHours, MAX_OPEN_SHIFT_HOURS, officeToday } from './attendance.time.js';

export async function employeeForUser(userId: string) {
  const employee = await prisma.employee.findUnique({ where: { userId } });
  if (!employee) throw new AppError(403, 'An employee record is required');
  return employee;
}

export async function getMyAttendance(userId: string, from?: string, to?: string): Promise<AttendanceDay[]> {
  const employee = await employeeForUser(userId);
  const range = resolveRange(from, to);
  const grid = await buildDayGrid([toGridEmployee(employee)], range.from, range.to);
  return grid.get(employee.id) ?? [];
}

/**
 * The caller's own month, as the one-row list the monthly summary returns. The org-wide summary
 * needs an attendance.read grant; the page that shows a person their own figures must not.
 */
export async function getMyMonthlySummary(userId: string, month: number, year: number): Promise<MonthlyAttendanceSummary[]> {
  const employee = await employeeForUser(userId);
  const { from, to } = monthRange(year, month);
  const grid = await buildDayGrid([toGridEmployee(employee)], from, to);
  return [summariseDays(toRef(employee), grid.get(employee.id) ?? [], month, year)];
}

/**
 * A shift opened on an earlier date and still running, such as a 22:00 start read after midnight. Only
 * one the check-out would accept: past the limit it is a forgotten punch for an administrator to correct.
 */
async function openEarlierShift(employeeId: string, today: Date) {
  const open = await prisma.attendance.findFirst({ where: { employeeId, date: { lt: today }, checkIn: { not: null }, checkOut: null }, orderBy: { date: 'desc' } });
  return open?.checkIn && elapsedHours(open.checkIn, new Date()) <= MAX_OPEN_SHIFT_HOURS ? open : null;
}

export async function getToday(userId: string): Promise<TodayAttendance> {
  const employee = await employeeForUser(userId);
  const date = officeToday();
  const [days, shifts] = await Promise.all([getMyAttendance(userId, formatDateOnly(date), formatDateOnly(date)), prisma.shift.findMany()]);
  const day = days[0];
  if (!day) throw new AppError(500, 'Today could not be derived');
  const carried = day.attendanceId === null ? await openEarlierShift(employee.id, date) : null;
  // Narrowed to the half actually worked, as the grid, the punch and the approval all do; without
  // this the card prints the full span while the log row beneath it uses the half.
  const shift = halfDayShift(resolveShift(toGridEmployee(employee), date, shifts), day.leaveFraction, day.leaveStartSession ?? 'FIRST_HALF');
  return {
    // Anchors the client's ticking clock so a machine a few minutes fast cannot promise "on time".
    serverTime: new Date().toISOString(),
    date: formatDateOnly(date),
    status: carried ? 'PRESENT' : day.status,
    // The card shows when the running shift began, not a blank for a day nobody has punched yet.
    checkIn: carried?.checkIn?.toISOString() ?? day.checkIn,
    checkOut: day.checkOut,
    workedHours: day.workedHours,
    isLate: carried ? carried.isLate : day.isLate,
    isEarlyOut: day.isEarlyOut,
    approval: day.approval,
    shift: shiftInfo(shift),
    // The server owns what "today" is; the client never infers these.
    canCheckIn: day.attendanceId === null && !carried,
    canCheckOut: carried !== null || (day.checkIn !== null && day.checkOut === null),
    detail: day.detail,
    leaveFraction: day.leaveFraction,
  };
}
