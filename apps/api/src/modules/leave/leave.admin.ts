import { z } from 'zod';
import { prisma } from '@erp/db';
import { writeAudit } from '@erp/audit';
import { AppError } from '@erp/utils';
const employmentTypes = z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN']);
// Defaults-free: an update built from `.partial()` of a schema with defaults would write every unsent field back to its default.
const fields = {
  name: z.string().trim().min(1).max(100),
  isPaid: z.boolean(),
  annualQuota: z.number().int().min(0).max(366),
  carryForwardPct: z.number().int().min(0).max(100),
  maxConsecutive: z.number().int().positive().nullable(),
  allowsBackdating: z.boolean(),
  eligibleFor: z.array(employmentTypes).min(1),
  countsHolidays: z.boolean(),
  accrualBasis: z.enum(['PRO_RATED', 'PER_EVENT', 'EARNED', 'NONE']),
  minServiceMonths: z.number().int().min(0),
  maxAccrual: z.number().int().positive().nullable(),
  allowsHalfDay: z.boolean(),
};
const createSchema = z.object({
  code: z.string().trim().min(1).max(60),
  ...fields,
  isPaid: fields.isPaid.default(true),
  carryForwardPct: fields.carryForwardPct.default(0),
  maxConsecutive: fields.maxConsecutive.optional(),
  allowsBackdating: fields.allowsBackdating.default(false),
  countsHolidays: fields.countsHolidays.default(false),
  accrualBasis: fields.accrualBasis.default('PRO_RATED'),
  minServiceMonths: fields.minServiceMonths.default(0),
  maxAccrual: fields.maxAccrual.optional(),
  allowsHalfDay: fields.allowsHalfDay.default(true),
});
// `code` and `statutory` are absent on purpose: a code is immutable, and a row the client could mark statutory is one it could then no longer correct.
const updateSchema = z.object(fields).partial().refine((body) => Object.values(body).some((value) => value !== undefined), { message: 'Provide at least one field to update' });
type Update = z.infer<typeof updateSchema>;
type LeaveTypeRow = NonNullable<Awaited<ReturnType<typeof prisma.leaveType.findUnique>>>;

/**
 * A statutory row (the Labour Act's) may be raised, never lowered: comparison is against the current row, so a raise is
 * one-way through the API. Fields that decide which section applies and how it computes have no coherent "up", so they are locked.
 */
function assertStatutoryUpdateAllowed(existing: LeaveTypeRow, input: Update): void {
  if (!existing.statutory) return;
  const refuse = (reason: string) => new AppError(409, `${existing.name} is statutory: ${reason}.`);
  for (const field of ['accrualBasis', 'countsHolidays', 'allowsBackdating', 'allowsHalfDay'] as const) {
    if (input[field] !== undefined && input[field] !== existing[field]) throw refuse(`${field} cannot be changed`);
  }
  for (const field of ['annualQuota', 'carryForwardPct'] as const) {
    const next = input[field];
    if (next !== undefined && next < existing[field]) throw refuse(`${field} cannot go below ${existing[field]}`);
  }
  for (const field of ['maxAccrual', 'maxConsecutive'] as const) {
    const next = input[field];
    if (next === undefined || next === null) continue; // null is uncapped, always at least as generous
    const current = existing[field];
    if (current === null) throw refuse(`${field} cannot be capped once it is uncapped`);
    if (next < current) throw refuse(`${field} cannot go below ${current}`);
  }
  // Inverted: a waiting period, so a smaller number is the more generous one.
  if (input.minServiceMonths !== undefined && input.minServiceMonths > existing.minServiceMonths) throw refuse(`minServiceMonths cannot go above ${existing.minServiceMonths}`);
  if (input.isPaid === false && existing.isPaid) throw refuse('isPaid cannot be turned off');
  if (input.eligibleFor) {
    const dropped = existing.eligibleFor.filter((type) => !input.eligibleFor!.includes(type));
    if (dropped.length > 0) throw refuse(`eligibleFor cannot drop ${dropped.join(', ')}`);
  }
}

const uniqueViolation = (e: unknown) => typeof e === 'object' && e !== null && 'code' in e && e.code === 'P2002';
const duplicate = () => new AppError(409, 'A leave type with this code or name already exists');

export async function createLeaveType(actor: string, input: unknown) {
  const data = createSchema.parse(input);
  try {
    return await prisma.$transaction(async tx => {
      const row = await tx.leaveType.create({ data: { ...data, statutory: false } });
      await writeAudit(tx, { entity: 'LEAVE_TYPE', entityId: row.id, action: 'CREATE', changedBy: actor, after: row });
      return row;
    });
  } catch (e) { if (uniqueViolation(e)) throw duplicate(); throw e; }
}

export async function updateLeaveType(actor: string, id: string, input: unknown) {
  const data = updateSchema.parse(input);
  try {
    return await prisma.$transaction(async tx => {
      const before = await tx.leaveType.findUnique({ where: { id } });
      if (!before) throw new AppError(404, 'Leave type not found');
      assertStatutoryUpdateAllowed(before, data);
      const row = await tx.leaveType.update({ where: { id }, data });
      await writeAudit(tx, { entity: 'LEAVE_TYPE', entityId: id, action: 'UPDATE', changedBy: actor, before, after: row });
      return row;
    });
  } catch (e) { if (uniqueViolation(e)) throw duplicate(); throw e; }
}

export async function deleteLeaveType(actor: string, id: string) {
  await prisma.$transaction(async tx => {
    const row = await tx.leaveType.findUnique({ where: { id }, include: { _count: { select: { requests: true, balances: true } } } });
    if (!row) throw new AppError(404, 'Leave type not found');
    if (row.statutory) throw new AppError(409, `${row.name} is a statutory leave type and cannot be deleted. Reduce it as far as the Act allows instead.`);
    if (row._count.requests || row._count.balances) throw new AppError(409, 'Leave type is in use');
    await tx.leaveType.delete({ where: { id } });
    await writeAudit(tx, { entity: 'LEAVE_TYPE', entityId: id, action: 'DELETE', changedBy: actor, before: row });
  });
}
export async function adjustBalance(actor: string, input: unknown) {
  const body = z.object({ employeeId: z.string().uuid(), leaveTypeId: z.string().uuid(), year: z.number().int().min(1900).max(9999), accrued: z.number().min(0), note: z.string().trim().min(1).max(1000) }).parse(input);
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${body.employeeId}))`;
    const key = { employeeId: body.employeeId, leaveTypeId: body.leaveTypeId, year: body.year };
    const old = await tx.leaveBalance.findUnique({ where: { employeeId_leaveTypeId_year: key } });
    if (old && body.accrued < old.used) throw new AppError(409, 'Entitlement cannot be below used days');
    const row = await tx.leaveBalance.upsert({ where: { employeeId_leaveTypeId_year: key }, create: { ...key, accrued: body.accrued, balance: body.accrued }, update: { accrued: body.accrued, balance: body.accrued - (old?.used ?? 0) } });
    await writeAudit(tx, { entity: 'LEAVE_BALANCE', entityId: row.id, action: old ? 'UPDATE' : 'CREATE', changedBy: actor, ...(old ? { before: old } : {}), after: { ...row, note: body.note } });
    return row;
  });
}
