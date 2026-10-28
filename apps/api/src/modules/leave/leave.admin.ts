import { z } from 'zod';
import { prisma } from '@erp/db';
import { writeAudit } from '@erp/audit';
import { AppError } from '@erp/utils';
const policy = z.object({ code: z.string().trim().min(1).max(60), name: z.string().trim().min(1).max(100), isPaid: z.boolean().default(true), annualQuota: z.number().int().min(0).max(366), carryForwardPct: z.number().int().min(0).max(100).default(0), maxConsecutive: z.number().int().positive().nullable().optional(), allowsBackdating: z.boolean().default(false), eligibleFor: z.array(z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN'])).min(1), statutory: z.boolean().default(false), countsHolidays: z.boolean().default(false), accrualBasis: z.enum(['PRO_RATED', 'PER_EVENT', 'EARNED', 'NONE']).default('PRO_RATED'), minServiceMonths: z.number().int().min(0).default(0), maxAccrual: z.number().int().positive().nullable().optional(), allowsHalfDay: z.boolean().default(true) });
export async function saveLeaveType(actor: string, input: unknown, id?: string) {
  const data = policy.parse(input);
  try {
    return await prisma.$transaction(async tx => {
      const before = id ? await tx.leaveType.findUnique({ where: { id } }) : null;
      if (id && !before) throw new AppError(404, 'Leave type not found');
      const row = id ? await tx.leaveType.update({ where: { id }, data }) : await tx.leaveType.create({ data });
      await writeAudit(tx, { entity: 'LEAVE_TYPE', entityId: row.id, action: id ? 'UPDATE' : 'CREATE', changedBy: actor, ...(before ? { before } : {}), after: row });
      return row;
    });
  } catch (e) { if (typeof e === 'object' && e !== null && 'code' in e && e.code === 'P2002') throw new AppError(409, 'Leave type already exists'); throw e; }
}
export async function deleteLeaveType(actor: string, id: string) {
  await prisma.$transaction(async tx => {
    const row = await tx.leaveType.findUnique({ where: { id }, include: { _count: { select: { requests: true, balances: true } } } });
    if (!row) throw new AppError(404, 'Leave type not found');
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
