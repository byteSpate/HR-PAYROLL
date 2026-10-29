import type { PunchResult } from '@erp/contracts/attendance';
import { prisma, type Attendance, type Shift } from '@erp/db';
import { formatDateOnly } from '@erp/export';
import { approverUserIds, notify } from '@erp/notifications';
import { AppError } from '@erp/utils';
import { halfDayShift, shiftInfo } from './attendance.derive.js';
import { employeeForUser } from './attendance.me.js';
import { computeIsEarlyOut, computeIsLate, elapsedHours, MAX_OPEN_SHIFT_HOURS, officeDateOf } from './attendance.time.js';
import { effectiveShift } from './shift.service.js';

export async function shiftFor(employeeId: string, date: Date) {
  const employee = await prisma.employee.findUnique({ where: { id: employeeId }, include: { shift: true } });
  if (!employee) throw new AppError(404, 'Employee not found');
  const dated = await prisma.shift.findMany({ where: { effectiveFrom: { lte: date }, effectiveTo: { gte: date } } });
  return effectiveShift(date, employee.shift, dated);
}

/**
 * The shift window a punch on this date is judged against.
 *
 * Punch flags are frozen at capture, so the leave has to be read before the write: without it
 * every first-half leave would flag the employee about four and a half hours late for arriving
 * exactly when they were due.
 */
async function expectedWindowFor(employeeId: string, date: Date, shift: Shift): Promise<Shift> {
  const leave = await prisma.leaveRequest.findFirst({
    where: { employeeId, status: 'APPROVED', startDate: { lte: date }, endDate: { gte: date } },
    select: { startDate: true, endDate: true, startSession: true, endSession: true },
  });
  if (!leave) return shift;
  const key = formatDateOnly(date);
  const secondHalfOff = key === formatDateOnly(leave.startDate) && leave.startSession === 'SECOND_HALF';
  const firstHalfOff = key === formatDateOnly(leave.endDate) && leave.endSession === 'FIRST_HALF';
  const fraction = 1 - (secondHalfOff ? 0.5 : 0) - (firstHalfOff ? 0.5 : 0);
  return halfDayShift(shift, fraction, secondHalfOff ? 'SECOND_HALF' : 'FIRST_HALF');
}

/** The derived context the punch card needs, without a second round trip. */
async function describe(row: Attendance, shift: Shift): Promise<PunchResult> {
  const [holidays, leave] = await Promise.all([
    prisma.holiday.findMany({ where: { date: row.date } }),
    prisma.leaveRequest.findFirst({
      where: { employeeId: row.employeeId, status: 'APPROVED', startDate: { lte: row.date }, endDate: { gte: row.date } },
      select: { leaveType: { select: { name: true } } },
    }),
  ]);
  const offNames = holidays.filter((h) => h.type !== 'WORKING_DAY').map((h) => h.name);
  const workingDayOverride = holidays.some((h) => h.type === 'WORKING_DAY');
  return {
    attendanceId: row.id,
    date: formatDateOnly(row.date),
    checkIn: row.checkIn?.toISOString() ?? null,
    checkOut: row.checkOut?.toISOString() ?? null,
    workedHours: row.workedHours,
    isLate: row.isLate,
    isEarlyOut: row.isEarlyOut,
    approval: row.approval,
    // A record exists, so the day is PRESENT: a check-in beats a holiday.
    status: 'PRESENT',
    isHoliday: offNames.length > 0,
    holidayName: offNames.length > 0 ? offNames.join(' · ') : null,
    isWeeklyOff: shift.weeklyOffDays.includes(row.date.getUTCDay()) && !workingDayOverride,
    onApprovedLeave: leave !== null,
    leaveTypeName: leave?.leaveType.name ?? null,
    shift: shiftInfo(shift),
  };
}

export async function checkIn(userId: string): Promise<PunchResult> {
  const employee = await employeeForUser(userId);
  const now = new Date();
  const date = officeDateOf(now);
  const shift = await shiftFor(employee.id, date);
  const expected = await expectedWindowFor(employee.id, date, shift);
  try {
    const row = await prisma.$transaction(async tx => {
      const created = await tx.attendance.create({ data: { employeeId: employee.id, date, checkIn: now, isLate: computeIsLate(now, expected) } });
      await tx.attendanceAudit.create({ data: { attendanceId: created.id, action: 'CHECK_IN', changedBy: userId, after: { checkIn: now.toISOString(), isLate: created.isLate } } });
      const recipients = await approverUserIds(tx, employee.id, 'attendance.approve');
      await notify(tx, recipients.map(id => ({ userId: id, type: 'attendance.pending', title: 'Attendance needs review', href: '/attendance/approvals', entity: 'ATTENDANCE', entityId: created.id })));
      return created;
    });
    return await describe(row, shift);
  } catch (error) {
    // The unique (employee, date) index is what makes a double-tapped button atomic.
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
      throw new AppError(409, 'You have already checked in today');
    }
    throw error;
  }
}

export async function checkOut(userId: string): Promise<PunchResult> {
  const employee = await employeeForUser(userId);
  const now = new Date();
  // The latest open row rather than today's, so a 22:00 start closed at 00:30 lands on the right day.
  const open = await prisma.attendance.findFirst({ where: { employeeId: employee.id, checkIn: { not: null }, checkOut: null }, orderBy: { date: 'desc' } });
  if (!open?.checkIn) throw new AppError(409, "You haven't checked in");
  const hours = elapsedHours(open.checkIn, now);
  if (hours > MAX_OPEN_SHIFT_HOURS) {
    // A forgotten check-out, not a long day: closing it silently would put an 18-hour shift into payroll unreviewed.
    throw new AppError(409, `Your last check-in was over ${MAX_OPEN_SHIFT_HOURS} hours ago; ask HR to correct it`);
  }
  // Resolved for the record's own date, so a shift change since then does not rewrite what the day was judged against.
  const shift = await shiftFor(employee.id, open.date);
  const expected = await expectedWindowFor(employee.id, open.date, shift);
  const row = await prisma.$transaction(async tx => {
    const closed = await tx.attendance.updateMany({ where: { id: open.id, checkOut: null }, data: { checkOut: now, workedHours: hours, isEarlyOut: computeIsEarlyOut(now, open.date, expected) } });
    if (!closed.count) throw new AppError(409, 'Already checked out');
    const updated = await tx.attendance.findUniqueOrThrow({ where: { id: open.id } });
    await tx.attendanceAudit.create({ data: { attendanceId: open.id, action: 'CHECK_OUT', changedBy: userId, before: { checkOut: null, workedHours: null }, after: { checkOut: now.toISOString(), workedHours: hours, isEarlyOut: updated.isEarlyOut } } });
    return updated;
  });
  // The record stays PENDING: closing a day is not approving it.
  return describe(row, shift);
}
