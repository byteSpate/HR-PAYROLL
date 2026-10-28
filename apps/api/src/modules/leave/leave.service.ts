import { z } from 'zod';
import { assertMayDecide, assertPending, decisionStamp } from '@erp/approvals';
import { writeAudit } from '@erp/audit';
import { dateOnly } from '@erp/contracts/attendance';
import { prisma } from '@erp/db';
import { emit } from '@erp/events';
import { officeToday } from '@erp/export';
import { approverUserIds, notify } from '@erp/notifications';
import { AppError } from '@erp/utils';
import type { Viewer } from '../employee/employee.access.js';
import { scopeForViewer } from '../attendance/attendance.approval.js';
import { shiftFor } from '../attendance/attendance.punch.js';
import { computeEarnedAccrual } from './leave.accrual.js';
import { countChargedDays } from './leave.dates.js';
import { computeEntitlement } from './leave.policy.js';

const session = z.enum(['FIRST_HALF', 'SECOND_HALF']);
const applicationSchema = z.object({ leaveTypeId: z.string().uuid(), startDate: dateOnly, endDate: dateOnly, startSession: session.default('FIRST_HALF'), endSession: session.default('SECOND_HALF'), reason: z.string().trim().max(1000).optional() });
const at = (s: string) => new Date(`${s}T00:00:00.000Z`);
const halfIndex = (date: Date, sessionValue: 'FIRST_HALF' | 'SECOND_HALF') => date.getTime() / 86400000 * 2 + (sessionValue === 'SECOND_HALF' ? 1 : 0);

export async function applyForLeave(userId: string, input: unknown) {
  const body = applicationSchema.parse(input);
  const start = at(body.startDate), end = at(body.endDate);
  if (start > end || start.getUTCFullYear() !== end.getUTCFullYear() || halfIndex(start, body.startSession) > halfIndex(end, body.endSession)) throw new AppError(400, 'Invalid leave range');
  const employee = await prisma.employee.findUnique({ where: { userId } });
  if (!employee) throw new AppError(403, 'An employee record is required');
  const type = await prisma.leaveType.findUnique({ where: { id: body.leaveTypeId } });
  if (!type || !type.eligibleFor.includes(employee.employmentType)) throw new AppError(400, 'Leave type is unavailable');
  if (!type.allowsBackdating && start < officeToday()) throw new AppError(400, 'This leave type cannot be backdated');
  if (!type.allowsHalfDay && (body.startSession !== 'FIRST_HALF' || body.endSession !== 'SECOND_HALF')) throw new AppError(400, 'Half days are not allowed');
  if (type.maxConsecutive !== null && (end.getTime() - start.getTime()) / 86400000 + 1 > type.maxConsecutive) throw new AppError(400, 'Leave exceeds the maximum consecutive days');
  const eligible = new Date(employee.joiningDate); eligible.setUTCMonth(eligible.getUTCMonth() + type.minServiceMonths);
  if (start < eligible) throw new AppError(400, 'Minimum service requirement is not met');
  const shift = await shiftFor(employee.id, start);
  const holidays = await prisma.holiday.findMany({ where: { date: { gte: start, lte: end } } });
  const chargedDays = countChargedDays({ start, end, startSession: body.startSession, endSession: body.endSession, countsHolidays: type.countsHolidays, weeklyOffDays: shift.weeklyOffDays, holidays: holidays.filter(h => h.type !== 'WORKING_DAY').map(h => h.date), workingDayOverrides: holidays.filter(h => h.type === 'WORKING_DAY').map(h => h.date) });
  if (chargedDays <= 0) throw new AppError(400, 'No chargeable leave days');
  const earned = type.accrualBasis === 'EARNED' ? await computeEarnedAccrual(employee, officeToday(), type.minServiceMonths, type.maxAccrual) : 0;
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${employee.id}))`;
    const overlaps = await tx.leaveRequest.findMany({ where: { employeeId: employee.id, status: { in: ['PENDING', 'APPROVED'] }, startDate: { lte: end }, endDate: { gte: start } } });
    if (overlaps.some(row => halfIndex(start, body.startSession) <= halfIndex(row.endDate, row.endSession) && halfIndex(end, body.endSession) >= halfIndex(row.startDate, row.startSession))) throw new AppError(409, 'Leave overlaps an existing request');
    const year = start.getUTCFullYear();
    if (type.isPaid) {
      const quota = type.accrualBasis === 'PER_EVENT' ? type.annualQuota : type.accrualBasis === 'PRO_RATED' ? computeEntitlement(type.annualQuota, employee.joiningDate, year) : earned;
      const balance = await tx.leaveBalance.upsert({ where: { employeeId_leaveTypeId_year: { employeeId: employee.id, leaveTypeId: type.id, year } }, create: { employeeId: employee.id, leaveTypeId: type.id, year, accrued: quota, balance: quota }, update: {} });
      const pending = await tx.leaveRequest.aggregate({ where: { employeeId: employee.id, leaveTypeId: type.id, status: 'PENDING', startDate: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) } }, _sum: { chargedDays: true } });
      if (balance.balance - (pending._sum.chargedDays ?? 0) < chargedDays) throw new AppError(409, 'Insufficient leave balance');
    }
    const row = await tx.leaveRequest.create({ data: { employeeId: employee.id, leaveTypeId: type.id, startDate: start, endDate: end, startSession: body.startSession, endSession: body.endSession, chargedDays, reason: body.reason } });
    const payload = { requestId: row.id, employeeId: employee.id, subjectUserId: userId, actorUserId: userId, chargedDays };
    await emit(tx, 'leave.requested', payload);
    const recipients = await approverUserIds(tx, employee.id, 'leave.approve');
    await notify(tx, recipients.map(id => ({ userId: id, type: 'leave.requested', title: 'Leave request awaiting approval', href: '/leave/approvals', entity: 'LEAVE_REQUEST', entityId: row.id })));
    return row;
  });
}

export async function decideLeave(viewer: Viewer, id: string, decision: 'APPROVED' | 'REJECTED', note?: string | null) {
  if (decision === 'REJECTED' && !note?.trim()) throw new AppError(400, 'A rejection note is required');
  const scope = await scopeForViewer(viewer, 'leave.approve');
  const actor = await prisma.employee.findUnique({ where: { userId: viewer.sub }, select: { id: true } });
  return prisma.$transaction(async tx => {
    const row = await tx.leaveRequest.findUnique({ where: { id }, include: { employee: true, leaveType: true } });
    if (!row) throw new AppError(404, 'Leave request not found');
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${row.employeeId}))`;
    const reachable = await tx.employee.count({ where: { AND: [scope, { id: row.employeeId }] } });
    assertMayDecide({ actorEmployeeId: actor?.id ?? null, actorIsAdmin: viewer.accessLevel !== 'STANDARD', subjectEmployeeId: row.employeeId, reaches: () => reachable > 0 });
    assertPending(row.status);
    const stamp = decisionStamp(viewer.sub, note);
    const updated = await tx.leaveRequest.updateMany({ where: { id, status: 'PENDING' }, data: { status: decision, ...stamp } });
    if (!updated.count) throw new AppError(409, 'This request has already been decided');
    if (decision === 'APPROVED' && row.leaveType.isPaid) {
      const changed = await tx.leaveBalance.updateMany({ where: { employeeId: row.employeeId, leaveTypeId: row.leaveTypeId, year: row.startDate.getUTCFullYear(), balance: { gte: row.chargedDays } }, data: { balance: { decrement: row.chargedDays }, used: { increment: row.chargedDays } } });
      if (!changed.count) throw new AppError(409, 'Insufficient leave balance');
    }
    const event = decision === 'APPROVED' ? 'leave.approved' : 'leave.rejected';
    await writeAudit(tx, { entity: 'LEAVE_REQUEST', entityId: id, action: decision === 'APPROVED' ? 'APPROVE' : 'REJECT', changedBy: viewer.sub, before: { status: row.status }, after: { status: decision, decisionNote: stamp.decisionNote } });
    await emit(tx, event, { requestId: id, employeeId: row.employeeId, subjectUserId: row.employee.userId, actorUserId: viewer.sub, chargedDays: row.chargedDays });
    await notify(tx, { userId: row.employee.userId, type: event, title: decision === 'APPROVED' ? 'Leave approved' : 'Leave rejected', href: '/me/leave', entity: 'LEAVE_REQUEST', entityId: id });
    return tx.leaveRequest.findUniqueOrThrow({ where: { id } });
  });
}

export async function cancelLeave(viewer: Viewer, id: string, revert = false) {
  const row = await prisma.leaveRequest.findUnique({ where: { id }, include: { employee: true, leaveType: true } });
  if (!row) throw new AppError(404, 'Leave request not found');
  const owner = row.employee.userId === viewer.sub;
  if (!(owner && row.status === 'PENDING' && !revert)) {
    const scope = await scopeForViewer(viewer, 'leave.manage');
    if (!await prisma.employee.count({ where: { AND: [scope, { id: row.employeeId }] } })) throw new AppError(403, 'Forbidden');
    if (row.status !== 'APPROVED' || (!revert && row.startDate <= officeToday())) throw new AppError(409, 'This leave cannot be cancelled');
  }
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${row.employeeId}))`;
    const changed = await tx.leaveRequest.updateMany({ where: { id, status: row.status }, data: { status: 'CANCELLED', ...decisionStamp(viewer.sub) } });
    if (!changed.count) throw new AppError(409, 'This request has already changed');
    if (row.status === 'APPROVED' && row.leaveType.isPaid) {
      await tx.leaveBalance.update({ where: { employeeId_leaveTypeId_year: { employeeId: row.employeeId, leaveTypeId: row.leaveTypeId, year: row.startDate.getUTCFullYear() } }, data: { balance: { increment: row.chargedDays }, used: { decrement: row.chargedDays } } });
    }
    await writeAudit(tx, { entity: 'LEAVE_REQUEST', entityId: id, action: 'CANCEL', changedBy: viewer.sub, before: { status: row.status }, after: { status: 'CANCELLED' } });
    await emit(tx, 'leave.cancelled', { requestId: id, employeeId: row.employeeId, subjectUserId: row.employee.userId, actorUserId: viewer.sub, chargedDays: row.chargedDays });
    return tx.leaveRequest.findUniqueOrThrow({ where: { id } });
  });
}
