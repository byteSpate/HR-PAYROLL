import type { AttendanceDay, AuditEntry } from '@erp/contracts/attendance';
import { prisma } from '@erp/db';
import { AppError } from '@erp/utils';
import type { Viewer } from '../employee/employee.access.js';
import { scopeForViewer } from '../employee/employee.scope.js';
import { buildDayGrid } from './attendance.derive.js';
import { resolveRange } from './attendance.range.js';
import { ROSTER_SELECT, toGridEmployee } from './attendance.summary.js';

/**
 * One person's derived days. Anyone may read their own; anyone else needs an attendance.read grant
 * that reaches that person (HR-MNG-V1 decided this by role; here the grant's scope decides).
 */
export async function getEmployeeAttendance(viewer: Viewer, employeeId: string, from?: string, to?: string): Promise<AttendanceDay[]> {
  const employee = await prisma.employee.findUnique({ where: { id: employeeId }, select: { ...ROSTER_SELECT, userId: true } });
  if (!employee) throw new AppError(404, 'Employee not found');

  if (employee.userId !== viewer.sub) {
    const reach = await scopeForViewer(viewer, 'attendance.read');
    const reached = await prisma.employee.findFirst({ where: { AND: [reach, { id: employeeId }] }, select: { id: true } });
    if (!reached) throw new AppError(403, 'You can only view your own attendance');
  }

  const range = resolveRange(from, to);
  const grid = await buildDayGrid([toGridEmployee(employee)], range.from, range.to);
  return grid.get(employee.id) ?? [];
}

/** Every change made to one record, newest first: the dispute is always about the value before someone edited it. */
export async function getAuditTrail(attendanceId: string): Promise<AuditEntry[]> {
  if (!(await prisma.attendance.findUnique({ where: { id: attendanceId }, select: { id: true } }))) {
    throw new AppError(404, 'Attendance record not found');
  }
  const rows = await prisma.attendanceAudit.findMany({ where: { attendanceId }, orderBy: { changedAt: 'desc' } });
  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    changedBy: r.changedBy,
    changedAt: r.changedAt.toISOString(),
    before: r.before,
    after: r.after,
    note: r.note,
  }));
}
