import { prisma } from '@erp/db';
import { officeInstantOf, elapsedHours } from './attendance.time.js';
import { shiftFor } from './attendance.punch.js';

export async function closeOpenDays(onDate: Date, now = new Date()): Promise<number> {
  const rows = await prisma.attendance.findMany({ where: { date: onDate, checkIn: { not: null }, checkOut: null } });
  let closed = 0;
  for (const row of rows) {
    if (!row.checkIn) continue;
    const shift = await shiftFor(row.employeeId, row.date);
    const checkOut = officeInstantOf(row.date, shift.endTime);
    const result = await prisma.attendance.updateMany({ where: { id: row.id, checkOut: null }, data: { checkOut, autoCheckOutAt: now, workedHours: Math.max(0, elapsedHours(row.checkIn, checkOut)) } });
    closed += result.count;
  }
  return closed;
}
