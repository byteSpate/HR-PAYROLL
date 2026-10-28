import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@erp/db';
import { decideAttendance, listAttendance } from './attendance.approval.js';
import { cleanActors, makeActor } from '../../test-utils/access.js';

const prefix = 'zzattapprove';
let actors: Awaited<ReturnType<typeof makeActor>>[];
let ids: string[];
let departmentId: string;
let rows: string[];
const viewer = (i: number, grants = ['attendance.approve:team', 'attendance.read:team']) => ({ sub: actors[i]!.user.id, accessLevel: 'STANDARD' as const, grants });
const admin = (i: number, accessLevel: 'ADMIN' | 'SUPER_ADMIN') => ({ sub: actors[i]!.user.id, accessLevel, grants: [] });
const status = (p: Promise<unknown>) => p.then(() => 0, (e: { status?: number }) => e.status);

beforeAll(async () => {
  actors = await Promise.all([0, 1, 2].map(() => makeActor(prefix, 'STANDARD')));
  departmentId = (await prisma.department.create({ data: { name: `${prefix}-${Date.now()}` } })).id;
  ids = [];
  for (let i = 0; i < actors.length; i++) {
    ids.push((await prisma.employee.create({ data: { userId: actors[i]!.user.id, employeeCode: `${prefix}-${Date.now()}-${i}`, fullName: `Person ${i}`, designation: 'Engineer', departmentId, employmentType: 'FULL_TIME', joiningDate: new Date('2026-01-01T00:00:00Z'), reportingManagerId: i === 1 ? ids[0] : undefined } })).id);
  }
});
beforeEach(async () => {
  rows = [];
  for (const id of ids) rows.push((await prisma.attendance.create({ data: { employeeId: id, date: new Date('2026-03-02T00:00:00Z') } })).id);
});
afterEach(async () => {
  await prisma.outboxEvent.deleteMany({ where: { type: { in: ['attendance.approved', 'attendance.rejected'] }, OR: rows.map(id => ({ payload: { path: ['attendanceId'], equals: id } })) } });
  await prisma.notification.deleteMany({ where: { userId: { in: actors.map(a => a.user.id) } } });
  await prisma.auditLog.deleteMany({ where: { entity: 'ATTENDANCE', entityId: { in: rows } } });
  await prisma.attendance.deleteMany({ where: { employeeId: { in: ids } } });
});
afterAll(async () => {
  await prisma.employee.updateMany({ where: { id: { in: ids } }, data: { reportingManagerId: null } });
  await prisma.employee.deleteMany({ where: { id: { in: ids } } });
  await prisma.department.delete({ where: { id: departmentId } });
  await cleanActors(prefix);
});

describe('attendance decisions', () => {
  it('approves a direct report with a stamp, event and notification', async () => {
    const row = await decideAttendance(viewer(0), rows[1]!, 'APPROVED');
    expect(row).toMatchObject({ approval: 'APPROVED', decidedBy: actors[0]!.user.id });
    expect(row.decidedAt).toBeInstanceOf(Date);
    expect(await prisma.notification.count({ where: { userId: actors[1]!.user.id, entityId: row.id } })).toBe(1);
    expect(await prisma.outboxEvent.count({ where: { type: 'attendance.approved', payload: { path: ['attendanceId'], equals: row.id } } })).toBe(1);
    expect(await status(decideAttendance(viewer(0), row.id, 'APPROVED'))).toBe(409);
  });
  it('enforces team reach and forbids standard self decisions even with all scope', async () => {
    expect(await status(decideAttendance(viewer(0), rows[2]!, 'APPROVED'))).toBe(403);
    expect(await status(decideAttendance(viewer(0), rows[0]!, 'APPROVED'))).toBe(403);
    expect(await status(decideAttendance(viewer(0, ['attendance.approve:all']), rows[0]!, 'APPROVED'))).toBe(403);
  });
  it.each(['ADMIN', 'SUPER_ADMIN'] as const)('permits %s self approval', async (level) => {
    expect((await decideAttendance(admin(0, level), rows[0]!, 'APPROVED')).approval).toBe('APPROVED');
  });
  it('requires a reason for rejection and restricts lists to direct reports', async () => {
    expect(await status(decideAttendance(viewer(0), rows[1]!, 'REJECTED'))).toBe(400);
    const result = await listAttendance(viewer(0), 'attendance.read', { date: '2026-03-02' });
    expect(result.map((r: { employeeId: string }) => r.employeeId)).toEqual([ids[1]]);
    expect(result[0]?.exceptions).toContain('MISSING_CHECKOUT');
  });
});
