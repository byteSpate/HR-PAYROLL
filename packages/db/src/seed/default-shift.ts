import type { Db } from '../client.js';

/**
 * Attendance falls back to the shift with this name for every employee who has none assigned. It is
 * a row so HR can change the company's hours in Settings; the service refuses to rename or delete it.
 */
export const DEFAULT_SHIFT_NAME = 'General';

/** Creates the company default once. An existing row is left alone: its hours may have been edited. */
export async function seedDefaultShift(db: Db): Promise<void> {
  if (await db.shift.findFirst({ where: { name: DEFAULT_SHIFT_NAME } })) return;
  await db.shift.create({
    data: { name: DEFAULT_SHIFT_NAME, startTime: '09:00', endTime: '18:00', breakMinutes: 60, graceMinutes: 15, weeklyOffDays: [5] },
  });
}
