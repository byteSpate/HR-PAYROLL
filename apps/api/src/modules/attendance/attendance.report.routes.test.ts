import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '@erp/db';
import { createApp } from '../../app.js';
import { cleanActors, makeActor } from '../../test-utils/access.js';

const prefix = 'zzreportapi';
const app = createApp();
let manager: Awaited<ReturnType<typeof makeActor>>;
let users: Awaited<ReturnType<typeof makeActor>>[];
let ids: string[];
let departmentId: string;
beforeAll(async () => {
  manager = await makeActor(prefix, 'STANDARD', ['attendance.report:team']);
  users = await Promise.all([0, 1].map(() => makeActor(prefix, 'STANDARD')));
  departmentId = (await prisma.department.create({ data: { name: `${prefix}-${Date.now()}` } })).id;
  ids = [];
  for (const [i, actor] of [manager, ...users].entries()) {
    ids.push((await prisma.employee.create({ data: { userId: actor.user.id, employeeCode: `${prefix}-${Date.now()}-${i}`, fullName: `Person ${i}`, designation: 'Engineer', departmentId, employmentType: 'FULL_TIME', joiningDate: new Date('2026-01-01T00:00:00Z'), reportingManagerId: i === 1 ? ids[0] : undefined } })).id);
  }
});
afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { changedBy: manager.user.id, action: 'EXPORT' } });
  await prisma.employee.updateMany({ where: { id: { in: ids } }, data: { reportingManagerId: null } });
  await prisma.employee.deleteMany({ where: { id: { in: ids } } });
  await prisma.department.delete({ where: { id: departmentId } });
  await cleanActors(prefix);
});
describe('attendance report routes', () => {
  it('limits team reports to direct reports', async () => {
    const res = await request(app).get('/api/attendance/report?month=2026-03').set(manager.header);
    expect(res.status).toBe(200);
    expect(res.body.map((row: { employeeId: string }) => row.employeeId)).toEqual([ids[1]]);
    expect((await request(app).get('/api/attendance/report?month=2026-03').set(users[0]!.header)).status).toBe(403);
  });
  it('audits one export', async () => {
    const res = await request(app).get('/api/attendance/report/export?month=2026-03&format=csv').set(manager.header);
    expect(res.status).toBe(200);
    expect(await prisma.auditLog.count({ where: { changedBy: manager.user.id, action: 'EXPORT' } })).toBe(1);
  });
});
