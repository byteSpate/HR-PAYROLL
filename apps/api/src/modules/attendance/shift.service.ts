import { shiftInputSchema, type ShiftImpact, type ShiftView, type ShiftWriteResult } from '@erp/contracts/attendance';
import { diffFields, writeAudit } from '@erp/audit';
import { DEFAULT_SHIFT_NAME, prisma, type Db, type Shift } from '@erp/db';
import { AppError } from '@erp/utils';

const toDate = (ymd: string | null | undefined) => (ymd ? new Date(`${ymd}T00:00:00.000Z`) : null);
const ymd = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const isUniqueViolation = (err: unknown) => typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';

/** What an employee with no shift assigned works: 09:00-18:00 with Friday off. */
export const DEFAULT_SHIFT: Shift = {
  id: 'default',
  name: DEFAULT_SHIFT_NAME,
  startTime: '09:00',
  endTime: '18:00',
  breakMinutes: 60,
  graceMinutes: 15,
  weeklyOffDays: [5],
  effectiveFrom: null,
  effectiveTo: null,
};

/**
 * The shift in force for a calendar day. A dated shift is a company-wide override for its window, so
 * it beats whatever the employee is assigned; with neither, the built-in default applies.
 */
export function effectiveShift(date: Date, assigned: Shift | null, dated: readonly Shift[]): Shift {
  const t = date.getTime();
  const override = dated.find((s) => s.effectiveFrom && s.effectiveTo && s.effectiveFrom.getTime() <= t && t <= s.effectiveTo.getTime());
  return override ?? assigned ?? DEFAULT_SHIFT;
}

type Row = Shift & { _count: { employees: number } };

const view = (s: Row): ShiftView => ({
  id: s.id,
  name: s.name,
  startTime: s.startTime,
  endTime: s.endTime,
  breakMinutes: s.breakMinutes,
  graceMinutes: s.graceMinutes,
  weeklyOffDays: [...s.weeklyOffDays].sort((a, b) => a - b),
  effectiveFrom: ymd(s.effectiveFrom),
  effectiveTo: ymd(s.effectiveTo),
  employeeCount: s._count.employees,
});

const COUNT = { _count: { select: { employees: true } } } as const;

export async function listShifts(): Promise<ShiftView[]> {
  const rows = await prisma.shift.findMany({ include: COUNT, orderBy: [{ effectiveFrom: 'asc' }, { name: 'asc' }] });
  return rows.map(view);
}

/** Two dated overrides covering the same day would leave "which hours apply" undefined. */
async function assertNoOverlap(db: Db, from: Date | null, to: Date | null, excludeId?: string): Promise<void> {
  if (!from || !to) return;
  const clash = await db.shift.findFirst({
    where: { ...(excludeId ? { id: { not: excludeId } } : {}), effectiveFrom: { lte: to }, effectiveTo: { gte: from } },
    select: { name: true },
  });
  if (clash) throw new AppError(409, `Those dates overlap the dated shift "${clash.name}"`);
}

const snapshot = (s: Shift) => ({ ...s, effectiveFrom: ymd(s.effectiveFrom), effectiveTo: ymd(s.effectiveTo) });

export async function createShift(input: unknown, actorId: string): Promise<ShiftView> {
  const body = shiftInputSchema.parse(input);
  const from = toDate(body.effectiveFrom);
  const to = toDate(body.effectiveTo);
  try {
    return await prisma.$transaction(async (tx) => {
      await assertNoOverlap(tx, from, to);
      const row = await tx.shift.create({
        data: { ...body, effectiveFrom: from, effectiveTo: to },
        include: COUNT,
      });
      await writeAudit(tx, { entity: 'SHIFT', entityId: row.id, action: 'CREATE', changedBy: actorId, after: JSON.parse(JSON.stringify(snapshot(row))) });
      return view(row);
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new AppError(409, 'A shift with that name already exists');
    throw err;
  }
}

const sameDays = (a: readonly number[], b: readonly number[]) => a.length === b.length && [...a].sort().every((day, i) => day === [...b].sort()[i]);

/** Employees on the shift, and the earliest attendance date among them. */
async function impactOf(shiftId: string): Promise<ShiftImpact> {
  const [affectedEmployees, earliest] = await Promise.all([
    prisma.employee.count({ where: { shiftId } }),
    prisma.attendance.findFirst({ where: { employee: { shiftId } }, orderBy: { date: 'asc' }, select: { date: true } }),
  ]);
  return { affectedEmployees, earliestAffectedDate: ymd(earliest?.date ?? null) };
}

export async function updateShift(id: string, input: unknown, actorId: string): Promise<ShiftWriteResult> {
  const body = shiftInputSchema.parse(input);
  const from = toDate(body.effectiveFrom);
  const to = toDate(body.effectiveTo);
  let offDaysChanged = false;
  try {
    const shift = await prisma.$transaction(async (tx) => {
      const before = await tx.shift.findUnique({ where: { id } });
      if (!before) throw new AppError(404, 'Shift not found');
      // Attendance resolves the fallback by this name, so a rename would orphan everyone without a shift.
      if (before.name === DEFAULT_SHIFT_NAME && body.name !== DEFAULT_SHIFT_NAME) {
        throw new AppError(409, `"${DEFAULT_SHIFT_NAME}" is the company default and cannot be renamed`);
      }
      await assertNoOverlap(tx, from, to, id);
      const row = await tx.shift.update({ where: { id }, data: { ...body, effectiveFrom: from, effectiveTo: to }, include: COUNT });
      offDaysChanged = !sameDays(before.weeklyOffDays, row.weeklyOffDays);
      const change = diffFields(snapshot(before) as Record<string, unknown>, snapshot(row) as Record<string, unknown>);
      if (change) {
        await writeAudit(tx, {
          entity: 'SHIFT', entityId: id, action: 'UPDATE', changedBy: actorId,
          before: JSON.parse(JSON.stringify(change.before)), after: JSON.parse(JSON.stringify(change.after)),
        });
      }
      return view(row);
    });
    // A read for the caller's benefit, so it runs after the write rather than holding the transaction open.
    return offDaysChanged ? { shift, impact: await impactOf(id) } : { shift };
  } catch (err) {
    if (isUniqueViolation(err)) throw new AppError(409, 'A shift with that name already exists');
    throw err;
  }
}

export async function deleteShift(id: string, actorId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const row = await tx.shift.findUnique({ where: { id }, include: COUNT });
    if (!row) throw new AppError(404, 'Shift not found');
    if (row.name === DEFAULT_SHIFT_NAME) throw new AppError(409, `"${DEFAULT_SHIFT_NAME}" is the company default and cannot be deleted`);
    // Deleting would silently move these people onto the default hours.
    if (row._count.employees > 0) throw new AppError(409, `${row._count.employees} employee(s) work this shift. Reassign them first.`);
    await tx.shift.delete({ where: { id } });
    await writeAudit(tx, { entity: 'SHIFT', entityId: id, action: 'DELETE', changedBy: actorId, before: JSON.parse(JSON.stringify(snapshot(row))) });
  });
}
