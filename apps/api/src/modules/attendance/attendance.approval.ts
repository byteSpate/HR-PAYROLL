import { assertMayDecide, assertPending, decisionStamp } from '@erp/approvals';
import { scopeFor } from '@erp/auth';
import { writeAudit } from '@erp/audit';
import { prisma, type Prisma } from '@erp/db';
import { emit } from '@erp/events';
import { notify } from '@erp/notifications';
import { AppError } from '@erp/utils';
import { dateOnly } from '@erp/contracts/attendance';
import { exceptionsFor } from './attendance.exceptions.js';
import { shiftFor } from './attendance.punch.js';
import { toMinutes } from './attendance.time.js';
import type { Viewer } from '../employee/employee.access.js';

export async function scopeForViewer(viewer: Viewer, permission: string): Promise<Prisma.EmployeeWhereInput> {
  const scope = scopeFor(viewer, permission);
  if (scope === 'all') return {};
  const me = await prisma.employee.findUnique({ where: { userId: viewer.sub }, select: { id: true, departmentId: true } });
  if (scope === 'department' && me) return { departmentId: me.departmentId };
  if (scope === 'team' && me) return { reportingManagerId: me.id };
  throw new AppError(403, 'Forbidden');
}

export async function listAttendance(viewer: Viewer, permission: string, filter: { date?: string; status?: string } = {}) {
  const employee = await scopeForViewer(viewer, permission);
  const date = filter.date ? new Date(`${dateOnly.parse(filter.date)}T00:00:00.000Z`) : undefined;
  const status = filter.status;
  if (status && !['PENDING', 'APPROVED', 'REJECTED'].includes(status)) throw new AppError(400, 'Invalid status');
  const rows = await prisma.attendance.findMany({ where: { employee, ...(date ? { date } : {}), ...(status ? { approval: status as 'PENDING' | 'APPROVED' | 'REJECTED' } : {}) }, include: { employee: { select: { id: true, fullName: true, employeeCode: true } } }, orderBy: { date: 'desc' } });
  return Promise.all(rows.map(async row => {
    const [shift, holidays, leave] = await Promise.all([
      shiftFor(row.employeeId, row.date),
      prisma.holiday.findMany({ where: { date: row.date } }),
      prisma.leaveRequest.count({ where: { employeeId: row.employeeId, status: 'APPROVED', startDate: { lte: row.date }, endDate: { gte: row.date } } }),
    ]);
    const working = holidays.some(h => h.type === 'WORKING_DAY');
    const isOffDay = !working && (shift.weeklyOffDays.includes(row.date.getUTCDay()) || holidays.some(h => h.type !== 'WORKING_DAY'));
    return { ...row, exceptions: exceptionsFor({ ...row, expectedHours: (toMinutes(shift.endTime) - toMinutes(shift.startTime)) / 60, onApprovedLeave: leave > 0, isOffDay }) };
  }));
}

export async function decideAttendance(viewer: Viewer, id: string, decision: 'APPROVED' | 'REJECTED', note?: string | null) {
  if (decision === 'REJECTED' && !note?.trim()) throw new AppError(400, 'A rejection note is required');
  const scope = await scopeForViewer(viewer, 'attendance.approve');
  const actor = await prisma.employee.findUnique({ where: { userId: viewer.sub }, select: { id: true } });
  return prisma.$transaction(async (tx) => {
    const row = await tx.attendance.findUnique({ where: { id }, include: { employee: true } });
    if (!row) throw new AppError(404, 'Attendance not found');
    const reachable = await tx.employee.count({ where: { AND: [scope, { id: row.employeeId }] } });
    assertMayDecide({ actorEmployeeId: actor?.id ?? null, actorIsAdmin: viewer.accessLevel !== 'STANDARD', subjectEmployeeId: row.employeeId, reaches: () => reachable > 0 });
    assertPending(row.approval);
    const stamp = decisionStamp(viewer.sub, note);
    const changed = await tx.attendance.updateMany({ where: { id, approval: 'PENDING' }, data: { approval: decision, ...stamp } });
    if (!changed.count) throw new AppError(409, 'This request has already been decided');
    const event = decision === 'APPROVED' ? 'attendance.approved' : 'attendance.rejected';
    await writeAudit(tx, { entity: 'ATTENDANCE', entityId: id, action: decision === 'APPROVED' ? 'APPROVE' : 'REJECT', changedBy: viewer.sub, before: { approval: row.approval }, after: { approval: decision, decisionNote: stamp.decisionNote } });
    await emit(tx, event, { attendanceId: id, employeeId: row.employeeId, date: row.date.toISOString().slice(0, 10), decidedBy: viewer.sub, decisionNote: stamp.decisionNote, selfDecided: actor?.id === row.employeeId });
    await notify(tx, { userId: row.employee.userId, type: event, title: decision === 'APPROVED' ? 'Attendance approved' : 'Attendance rejected', entity: 'ATTENDANCE', entityId: id, href: '/me/attendance' });
    return tx.attendance.findUniqueOrThrow({ where: { id } });
  });
}
