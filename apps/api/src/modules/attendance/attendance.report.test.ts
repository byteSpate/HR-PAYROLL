import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@erp/db';
import { closeOpenDays } from './attendance.autoclose.js';
import { dailyGrid, monthlySummary } from './attendance.grid.js';
import { cleanActors, makeActor } from '../../test-utils/access.js';

const prefix = 'zzattreport';
let actor: Awaited<ReturnType<typeof makeActor>>;
let employeeId: string;
let deptId: string;
let holidayId: string;
const date = (value: string) => new Date(`${value}T00:00:00Z`);
beforeAll(async () => {
  actor = await makeActor(prefix, 'STANDARD');
  deptId = (await prisma.department.create({ data: { name: `${prefix}-${Date.now()}` } })).id;
  employeeId = (await prisma.employee.create({ data: { userId: actor.user.id, employeeCode: `${prefix}-${Date.now()}`, fullName: 'Report Person', designation: 'Engineer', departmentId: deptId, employmentType: 'FULL_TIME', joiningDate: date('2026-03-01') } })).id;
  holidayId = (await prisma.holiday.create({ data: { name: `${prefix}-${Date.now()}`, date: date('2026-03-05') } })).id;
});
afterAll(async () => {
  await prisma.attendance.deleteMany({ where: { employeeId } });
  await prisma.holiday.delete({ where: { id: holidayId } });
  await prisma.employee.delete({ where: { id: employeeId } });
  await prisma.department.delete({ where: { id: deptId } });
  await cleanActors(prefix);
});
describe('attendance reports', () => {
  it('treats holidays and Fridays as non-absent and supports injected leave', async () => {
    const grid = await dailyGrid({ id: employeeId }, '2026-03', async () => new Map([[employeeId, new Set(['2026-03-04'])]]));
    expect(grid[0]?.days.find((d: { date: string }) => d.date === '2026-03-04')?.status).toBe('leave');
    expect(grid[0]?.days.find((d: { date: string }) => d.date === '2026-03-05')?.status).toBe('holiday');
    expect(grid[0]?.days.find((d: { date: string }) => d.date === '2026-03-06')?.status).toBe('off');
    const summary = await monthlySummary({ id: employeeId }, '2026-03');
    expect(summary[0]?.absent).toBeLessThan(31);
  });
  it('closes only open punches, preserves source and is idempotent', async () => {
    const row = await prisma.attendance.create({ data: { employeeId, date: date('2026-03-02'), checkIn: new Date('2026-03-02T03:00:00Z'), source: 'WEB' } });
    const now = new Date('2026-03-03T00:00:00Z');
    expect(await closeOpenDays(date('2026-03-02'), now)).toBe(1);
    const result = await prisma.attendance.findUniqueOrThrow({ where: { id: row.id } });
    expect(result).toMatchObject({ checkOut: new Date('2026-03-02T12:00:00Z'), autoCheckOutAt: now, source: 'WEB' });
    expect(await closeOpenDays(date('2026-03-02'), now)).toBe(0);
  });
});
