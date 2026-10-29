import { dateOnly } from '@erp/contracts/attendance';
import type { DecidedBy, HalfDayWindow, LeaveBalanceItem, LeaveRequestItem, TeamMemberStatus } from '@erp/contracts/leave';
import { prisma, type Prisma } from '@erp/db';
import { formatDateOnly, officeToday } from '@erp/export';
import { AppError } from '@erp/utils';
import { scopeForViewer } from '../employee/employee.scope.js';
import { employeeForUser } from '../attendance/attendance.me.js';
import { shiftFor } from '../attendance/attendance.punch.js';
import { shiftMidpoint } from '../attendance/attendance.time.js';
import type { Viewer } from '../employee/employee.access.js';
import { balancesFor } from './leave.service.js';

// The shapes HR-MNG-V1's leave screens read. The service keeps its own row shapes; this maps them.

const include = { leaveType: true, employee: { select: { id: true, fullName: true, employeeCode: true } } } as const;

async function decidersOf(ids: (string | null)[]): Promise<Map<string, DecidedBy>> {
  const wanted = [...new Set(ids.filter((id): id is string => id !== null))];
  if (wanted.length === 0) return new Map();
  const users = await prisma.user.findMany({ where: { id: { in: wanted } }, select: { id: true, email: true, employee: { select: { fullName: true } } } });
  return new Map(users.map((u) => [u.id, { id: u.id, email: u.email, fullName: u.employee?.fullName ?? null }]));
}

type Row = Awaited<ReturnType<typeof rows>>[number];
const rows = (where: Prisma.LeaveRequestWhereInput) => prisma.leaveRequest.findMany({ where, include, orderBy: { createdAt: 'desc' } });

const toItem = (row: Row, deciders: Map<string, DecidedBy>): LeaveRequestItem => ({
  id: row.id,
  employee: row.employee,
  leaveType: { id: row.leaveType.id, code: row.leaveType.code, name: row.leaveType.name, isPaid: row.leaveType.isPaid },
  startDate: formatDateOnly(row.startDate),
  endDate: formatDateOnly(row.endDate),
  startSession: row.startSession,
  endSession: row.endSession,
  days: row.chargedDays,
  reason: row.reason,
  status: row.status,
  decidedBy: row.decidedBy ? (deciders.get(row.decidedBy) ?? null) : null,
  decidedAt: row.decidedAt?.toISOString() ?? null,
  decisionNote: row.decisionNote,
  createdAt: row.createdAt.toISOString(),
});

async function toItems(list: Row[]): Promise<LeaveRequestItem[]> {
  const deciders = await decidersOf(list.map((r) => r.decidedBy));
  return list.map((r) => toItem(r, deciders));
}

/** One request after a change, for the call that made it. */
export async function requestItem(id: string): Promise<LeaveRequestItem> {
  const [row] = await rows({ id });
  if (!row) throw new AppError(404, 'Leave request not found');
  return (await toItems([row]))[0]!;
}

/**
 * Own requests, plus everyone the caller's leave.read grant reaches. HR-MNG-V1 decided this by
 * role; here the grant's scope decides, so a manager sees their team and an HR admin sees all.
 */
export async function listRequests(viewer: Viewer): Promise<LeaveRequestItem[]> {
  const own = await prisma.employee.findUnique({ where: { userId: viewer.sub }, select: { id: true } });
  const reach = await scopeForViewer(viewer, 'leave.read').catch((error: unknown) => {
    if (error instanceof AppError && error.status === 403) return null;
    throw error;
  });
  // The all scope is an empty filter, which an OR would read as "matches nothing" rather than everyone.
  if (reach && Object.keys(reach).length === 0) return toItems(await rows({}));
  const reachable: Prisma.EmployeeWhereInput[] = [...(own ? [{ id: own.id }] : []), ...(reach ? [reach] : [])];
  if (reachable.length === 0) return [];
  return toItems(await rows({ employee: { OR: reachable } }));
}

export async function myBalances(userId: string, year: number): Promise<LeaveBalanceItem[]> {
  const employee = await employeeForUser(userId);
  const balances = await balancesFor(employee.id, year);
  const pending = await prisma.leaveRequest.groupBy({
    by: ['leaveTypeId'],
    where: { employeeId: employee.id, status: 'PENDING', startDate: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) } },
    _sum: { chargedDays: true },
  });
  return balances.map((b) => ({
    leaveTypeId: b.leaveTypeId,
    code: b.leaveType.code,
    name: b.leaveType.name,
    isPaid: b.leaveType.isPaid,
    annualQuota: b.leaveType.annualQuota,
    entitlement: b.accrued,
    used: b.used,
    pending: pending.find((p) => p.leaveTypeId === b.leaveTypeId)?._sum.chargedDays ?? 0,
    balance: b.balance,
    // The earned-leave working (days worked, window) is not computed here yet; the tile shows the plain figure.
    accrual: null,
  }));
}

export async function getTeamStatus(viewer: Viewer): Promise<TeamMemberStatus[]> {
  const scope = await scopeForViewer(viewer, 'leave.read');
  const today = officeToday();
  const people = await prisma.employee.findMany({
    where: scope,
    orderBy: { fullName: 'asc' },
    select: { id: true, fullName: true, employeeCode: true, designation: true, employmentStatus: true },
  });
  const away = await prisma.leaveRequest.findMany({
    where: { employeeId: { in: people.map((p) => p.id) }, status: 'APPROVED', startDate: { lte: today }, endDate: { gte: today } },
    select: { employeeId: true, startDate: true, endDate: true, leaveType: { select: { name: true } } },
  });
  return people.map((p) => {
    const current = away.find((a) => a.employeeId === p.id);
    // Precedence: left, then on leave, then active. A pending request says nothing about where someone is today.
    const left = p.employmentStatus === 'RESIGNED' || p.employmentStatus === 'TERMINATED';
    const onLeave = !left && current !== undefined;
    return {
      id: p.id,
      fullName: p.fullName,
      employeeCode: p.employeeCode,
      designation: p.designation,
      status: left ? 'LEFT' : onLeave ? 'ON_LEAVE' : 'ACTIVE',
      currentLeave: onLeave && current ? { leaveTypeName: current.leaveType.name, startDate: formatDateOnly(current.startDate), endDate: formatDateOnly(current.endDate) } : null,
    };
  });
}

/** The shift window a half day is measured against, for one date. */
export async function getHalfDayWindow(userId: string, date: unknown): Promise<HalfDayWindow> {
  const employee = await employeeForUser(userId);
  const shift = await shiftFor(employee.id, new Date(`${dateOnly.parse(date)}T00:00:00.000Z`));
  return { startTime: shift.startTime, midpoint: shiftMidpoint(shift), endTime: shift.endTime };
}
