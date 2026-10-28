import { holidayInputSchema, type HolidayView } from '@erp/contracts/attendance';
import { diffFields, writeAudit } from '@erp/audit';
import { prisma, type Holiday } from '@erp/db';
import { AppError } from '@erp/utils';

const toDate = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);
const isUniqueViolation = (err: unknown) => typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';

const view = (h: Holiday): HolidayView => ({ id: h.id, name: h.name, date: h.date.toISOString().slice(0, 10), type: h.type });

export async function listHolidays(opts: { year?: number } = {}): Promise<HolidayView[]> {
  const where = opts.year ? { date: { gte: toDate(`${opts.year}-01-01`), lte: toDate(`${opts.year}-12-31`) } } : {};
  return (await prisma.holiday.findMany({ where, orderBy: [{ date: 'asc' }, { name: 'asc' }] })).map(view);
}

export async function createHoliday(input: unknown, actorId: string): Promise<HolidayView> {
  const body = holidayInputSchema.parse(input);
  try {
    return await prisma.$transaction(async (tx) => {
      const row = await tx.holiday.create({ data: { name: body.name, type: body.type, date: toDate(body.date) } });
      await writeAudit(tx, { entity: 'HOLIDAY', entityId: row.id, action: 'CREATE', changedBy: actorId, after: view(row) as never });
      return view(row);
    });
  } catch (err) {
    // Unique on (date, name): May Day and Buddha Purnima may share a date, a repeat of one may not.
    if (isUniqueViolation(err)) throw new AppError(409, 'That holiday is already on the calendar for that date');
    throw err;
  }
}

export async function updateHoliday(id: string, input: unknown, actorId: string): Promise<HolidayView> {
  const body = holidayInputSchema.parse(input);
  try {
    return await prisma.$transaction(async (tx) => {
      const before = await tx.holiday.findUnique({ where: { id } });
      if (!before) throw new AppError(404, 'Holiday not found');
      const row = await tx.holiday.update({ where: { id }, data: { name: body.name, type: body.type, date: toDate(body.date) } });
      const change = diffFields(view(before) as unknown as Record<string, unknown>, view(row) as unknown as Record<string, unknown>);
      if (change) {
        await writeAudit(tx, { entity: 'HOLIDAY', entityId: id, action: 'UPDATE', changedBy: actorId, before: change.before as never, after: change.after as never });
      }
      return view(row);
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new AppError(409, 'That holiday is already on the calendar for that date');
    throw err;
  }
}

export async function deleteHoliday(id: string, actorId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const row = await tx.holiday.findUnique({ where: { id } });
    if (!row) throw new AppError(404, 'Holiday not found');
    await tx.holiday.delete({ where: { id } });
    await writeAudit(tx, { entity: 'HOLIDAY', entityId: id, action: 'DELETE', changedBy: actorId, before: view(row) as never });
  });
}
