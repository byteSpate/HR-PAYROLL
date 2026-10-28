import { holidayInputSchema, holidayPatchSchema, type HolidayItem, type HolidayWriteResult, type ImpactBlock } from '@erp/contracts/attendance';
import { diffFields, writeAudit } from '@erp/audit';
import { prisma, type Db, type Holiday } from '@erp/db';
import { formatDateOnly, officeToday } from '@erp/export';
import { AppError } from '@erp/utils';

const toDate = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);
const isUniqueViolation = (err: unknown) => typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';

const view = (h: Holiday): HolidayItem => ({ id: h.id, name: h.name, date: formatDateOnly(h.date), type: h.type });

export async function listHolidays(opts: { year?: number } = {}): Promise<HolidayItem[]> {
  const where = opts.year ? { date: { gte: toDate(`${opts.year}-01-01`), lte: toDate(`${opts.year}-12-31`) } } : {};
  return (await prisma.holiday.findMany({ where, orderBy: [{ date: 'asc' }, { name: 'asc' }] })).map(view);
}

/**
 * What changes if this date stops or starts being a holiday. The day grid is derived, so a write here
 * rewrites every employee's status for that date with no migration and no trace; the screen shows this
 * before letting it through. Only dates on or before today are reported: a future day has no record yet.
 */
async function impactOf(db: Db, dates: Date[]): Promise<ImpactBlock | undefined> {
  const today = officeToday();
  const past = dates.filter((d) => d <= today);
  if (past.length === 0) return undefined;
  const affectedEmployees = await db.employee.count({ where: { employmentStatus: { in: ['ACTIVE', 'ON_LEAVE'] } } });
  const affectedDates = past.map(formatDateOnly).sort();
  const monthsTouched = [...new Set(affectedDates.map((d) => d.slice(0, 7)))].sort();
  return { affectedEmployees, affectedDates, monthsTouched };
}

export async function createHoliday(input: unknown, actorId: string): Promise<HolidayWriteResult> {
  const body = holidayInputSchema.parse(input);
  const date = toDate(body.date);
  try {
    return await prisma.$transaction(async (tx) => {
      const row = await tx.holiday.create({ data: { name: body.name, type: body.type, date } });
      await writeAudit(tx, { entity: 'HOLIDAY', entityId: row.id, action: 'CREATE', changedBy: actorId, after: view(row) as never });
      return { holiday: view(row), impact: await impactOf(tx, [date]) };
    });
  } catch (err) {
    // Unique on (date, name): May Day and Buddha Purnima may share a date, a repeat of one may not.
    if (isUniqueViolation(err)) throw new AppError(409, 'That holiday is already on the calendar for that date');
    throw err;
  }
}

export async function updateHoliday(id: string, input: unknown, actorId: string): Promise<HolidayWriteResult> {
  const patch = holidayPatchSchema.parse(input);
  try {
    return await prisma.$transaction(async (tx) => {
      const before = await tx.holiday.findUnique({ where: { id } });
      if (!before) throw new AppError(404, 'Holiday not found');
      const date = patch.date ? toDate(patch.date) : before.date;
      const row = await tx.holiday.update({
        where: { id },
        data: { name: patch.name ?? before.name, type: patch.type ?? before.type, date },
      });
      const change = diffFields(view(before) as unknown as Record<string, unknown>, view(row) as unknown as Record<string, unknown>);
      if (change) {
        await writeAudit(tx, { entity: 'HOLIDAY', entityId: id, action: 'UPDATE', changedBy: actorId, before: change.before as never, after: change.after as never });
      }
      // A move touches both the day it left and the day it landed on.
      const touched = before.date.getTime() === date.getTime() ? [date] : [before.date, date];
      return { holiday: view(row), impact: await impactOf(tx, touched) };
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new AppError(409, 'That holiday is already on the calendar for that date');
    throw err;
  }
}

export async function deleteHoliday(id: string, actorId: string): Promise<{ impact?: ImpactBlock }> {
  return prisma.$transaction(async (tx) => {
    const row = await tx.holiday.findUnique({ where: { id } });
    if (!row) throw new AppError(404, 'Holiday not found');
    await tx.holiday.delete({ where: { id } });
    await writeAudit(tx, { entity: 'HOLIDAY', entityId: id, action: 'DELETE', changedBy: actorId, before: view(row) as never });
    return { impact: await impactOf(tx, [row.date]) };
  });
}
