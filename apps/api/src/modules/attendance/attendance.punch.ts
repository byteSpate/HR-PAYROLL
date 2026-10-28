import { prisma } from '@erp/db';
import { monthString } from '@erp/contracts/attendance';
import { AppError } from '@erp/utils';
import { computeIsEarlyOut, computeIsLate, elapsedHours, MAX_OPEN_SHIFT_HOURS, officeDateOf } from './attendance.time.js';
import { effectiveShift } from './shift.service.js';

async function employeeFor(userId: string) {
  const employee = await prisma.employee.findUnique({ where: { userId }, include: { shift: true } });
  if (!employee) throw new AppError(403, 'An employee record is required');
  return employee;
}

export async function shiftFor(employeeId: string, date: Date) {
  const employee = await prisma.employee.findUnique({ where: { id: employeeId }, include: { shift: true } });
  if (!employee) throw new AppError(404, 'Employee not found');
  const dated = await prisma.shift.findMany({ where: { effectiveFrom: { lte: date }, effectiveTo: { gte: date } } });
  return effectiveShift(date, employee.shift, dated);
}

export async function checkIn(userId: string) {
  const employee = await employeeFor(userId);
  const now = new Date();
  const date = officeDateOf(now);
  const shift = await shiftFor(employee.id, date);
  try {
    return await prisma.attendance.create({ data: { employeeId: employee.id, date, checkIn: now, isLate: computeIsLate(now, shift) } });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
      throw new AppError(409, 'Already checked in today');
    }
    throw error;
  }
}

export async function checkOut(userId: string) {
  const employee = await employeeFor(userId);
  const now = new Date();
  const row = await prisma.attendance.findFirst({ where: { employeeId: employee.id, checkIn: { not: null }, checkOut: null }, orderBy: { date: 'desc' } });
  if (!row?.checkIn) throw new AppError(409, 'No open check-in');
  if (elapsedHours(row.checkIn, now) > MAX_OPEN_SHIFT_HOURS) throw new AppError(409, 'Your last check-in is too old; ask HR to correct it');
  const shift = await shiftFor(employee.id, row.date);
  const result = await prisma.attendance.updateMany({ where: { id: row.id, checkOut: null }, data: {
    checkOut: now, workedHours: elapsedHours(row.checkIn, now), isEarlyOut: computeIsEarlyOut(now, row.date, shift),
  } });
  if (!result.count) throw new AppError(409, 'Already checked out');
  return prisma.attendance.findUniqueOrThrow({ where: { id: row.id } });
}

export async function myAttendance(userId: string, month: string) {
  const employee = await employeeFor(userId);
  monthString.parse(month);
  const start = new Date(`${month}-01T00:00:00.000Z`);
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  return prisma.attendance.findMany({ where: { employeeId: employee.id, date: { gte: start, lt: end } }, orderBy: { date: 'desc' } });
}
