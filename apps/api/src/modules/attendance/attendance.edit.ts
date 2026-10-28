import { z } from 'zod';
import { dateOnly } from '@erp/contracts/attendance';
import { writeAudit } from '@erp/audit';
import { prisma } from '@erp/db';
import { emit } from '@erp/events';
import { approverUserIds, notify } from '@erp/notifications';
import { AppError } from '@erp/utils';
import type { Viewer } from '../employee/employee.access.js';
import { scopeForViewer } from './attendance.approval.js';
import { computeIsEarlyOut, computeIsLate, elapsedHours, officeInstantOf } from './attendance.time.js';
import { shiftFor } from './attendance.punch.js';

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const editSchema = z.object({ checkIn: time.nullable().optional(), checkOut: time.nullable().optional(), note: z.string().trim().min(1).max(1000) });
const regulariseSchema = editSchema.extend({ date: dateOnly });
const snapshot = (row: { checkIn: Date | null; checkOut: Date | null; workedHours: number | null; approval: string }) => ({ checkIn: row.checkIn?.toISOString() ?? null, checkOut: row.checkOut?.toISOString() ?? null, workedHours: row.workedHours, approval: row.approval });

async function times(employeeId: string, date: Date, input: z.infer<typeof editSchema>, previous?: { checkIn: Date | null; checkOut: Date | null }) {
  const checkIn = input.checkIn === undefined ? previous?.checkIn ?? null : input.checkIn === null ? null : officeInstantOf(date, input.checkIn);
  const checkOut = input.checkOut === undefined ? previous?.checkOut ?? null : input.checkOut === null ? null : officeInstantOf(date, input.checkOut);
  if (checkOut && (!checkIn || checkOut < checkIn)) throw new AppError(400, 'Check-out must follow check-in');
  const shift = await shiftFor(employeeId, date);
  return { checkIn, checkOut, workedHours: checkIn && checkOut ? elapsedHours(checkIn, checkOut) : null, isLate: checkIn ? computeIsLate(checkIn, shift) : false, isEarlyOut: checkOut ? computeIsEarlyOut(checkOut, date, shift) : false };
}

export async function regulariseAttendance(userId: string, input: unknown) {
  const body = regulariseSchema.parse(input);
  const employee = await prisma.employee.findUnique({ where: { userId } });
  if (!employee) throw new AppError(403, 'An employee record is required');
  const date = new Date(`${body.date}T00:00:00.000Z`);
  const old = await prisma.attendance.findUnique({ where: { employeeId_date: { employeeId: employee.id, date } } });
  const calculated = await times(employee.id, date, body, old ?? undefined);
  return prisma.$transaction(async (tx) => {
    const row = await tx.attendance.upsert({ where: { employeeId_date: { employeeId: employee.id, date } }, create: { employeeId: employee.id, date, ...calculated, regularisedAt: new Date(), regularisedNote: body.note }, update: { ...calculated, approval: 'PENDING', decidedBy: null, decidedAt: null, decisionNote: null, regularisedAt: new Date(), regularisedNote: body.note } });
    await tx.attendanceAudit.create({ data: { attendanceId: row.id, action: 'REGULARISE', changedBy: userId, before: old ? snapshot(old) : undefined, after: snapshot(row), note: body.note } });
    const users = await approverUserIds(tx, employee.id, 'attendance.approve');
    await notify(tx, users.map((id) => ({ userId: id, type: 'attendance.regularised', title: 'Attendance needs review', href: '/attendance/approvals', entity: 'ATTENDANCE', entityId: row.id })));
    return row;
  });
}

export async function correctAttendance(viewer: Viewer, id: string, input: unknown) {
  const body = editSchema.parse(input);
  const scope = await scopeForViewer(viewer, 'attendance.manage');
  const old = await prisma.attendance.findFirst({ where: { id, employee: scope } });
  if (!old) throw new AppError(404, 'Attendance not found');
  const calculated = await times(old.employeeId, old.date, body, old);
  return prisma.$transaction(async (tx) => {
    const row = await tx.attendance.update({ where: { id }, data: { ...calculated, correctedBy: viewer.sub, correctedAt: new Date(), correctionNote: body.note } });
    await tx.attendanceAudit.create({ data: { attendanceId: id, action: 'CORRECT', changedBy: viewer.sub, before: snapshot(old), after: snapshot(row), note: body.note } });
    await writeAudit(tx, { entity: 'ATTENDANCE', entityId: id, action: 'UPDATE', changedBy: viewer.sub, before: snapshot(old), after: snapshot(row) });
    await emit(tx, 'attendance.corrected', { attendanceId: id, employeeId: row.employeeId, date: row.date.toISOString().slice(0, 10), correctedBy: viewer.sub });
    return row;
  });
}

export async function manualAttendance(viewer: Viewer, input: unknown) {
  const body = regulariseSchema.extend({ employeeId: z.string().uuid() }).parse(input);
  const scope = await scopeForViewer(viewer, 'attendance.manage');
  const employee = await prisma.employee.findFirst({ where: { AND: [scope, { id: body.employeeId }] } });
  if (!employee) throw new AppError(404, 'Employee not found');
  const date = new Date(`${body.date}T00:00:00.000Z`);
  const calculated = await times(employee.id, date, body);
  try {
    return await prisma.$transaction(async (tx) => {
      const row = await tx.attendance.create({ data: { employeeId: employee.id, date, ...calculated, source: 'MANUAL', correctedBy: viewer.sub, correctedAt: new Date(), correctionNote: body.note } });
      await tx.attendanceAudit.create({ data: { attendanceId: row.id, action: 'MANUAL', changedBy: viewer.sub, after: snapshot(row), note: body.note } });
      await writeAudit(tx, { entity: 'ATTENDANCE', entityId: row.id, action: 'CREATE', changedBy: viewer.sub, after: snapshot(row) });
      await emit(tx, 'attendance.corrected', { attendanceId: row.id, employeeId: employee.id, date: body.date, correctedBy: viewer.sub });
      return row;
    });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') throw new AppError(409, 'Attendance already exists for this day');
    throw error;
  }
}
