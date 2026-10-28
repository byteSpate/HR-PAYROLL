import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '@erp/db';
import { createApp } from '../../app.js';
import { cleanActors, makeActor } from '../../test-utils/access.js';

const prefix = 'zzattroutes';
const app = createApp();
let admin: Awaited<ReturnType<typeof makeActor>>;
let user: Awaited<ReturnType<typeof makeActor>>;
let employeeId: string;
let departmentId: string;
const ids: string[] = [];
beforeAll(async () => {
  admin = await makeActor(prefix, 'ADMIN');
  user = await makeActor(prefix, 'STANDARD');
  departmentId = (await prisma.department.create({ data: { name: `${prefix}-${Date.now()}` } })).id;
  employeeId = (await prisma.employee.create({ data: { userId: user.user.id, employeeCode: `${prefix}-${Date.now()}`, fullName: 'Test Employee', designation: 'Engineer', departmentId, employmentType: 'FULL_TIME', joiningDate: new Date('2026-01-01T00:00:00Z') } })).id;
  for (const date of ['2026-03-02', '2026-03-03']) ids.push((await prisma.attendance.create({ data: { employeeId, date: new Date(`${date}T00:00:00Z`) } })).id);
});
afterAll(async () => {
  await prisma.outboxEvent.deleteMany({ where: { OR: ids.map(id => ({ payload: { path: ['attendanceId'], equals: id } })) } });
  await prisma.notification.deleteMany({ where: { userId: { in: [admin.user.id, user.user.id] } } });
  await prisma.auditLog.deleteMany({ where: { entity: 'ATTENDANCE', entityId: { in: ids } } });
  await prisma.attendanceAudit.deleteMany({ where: { attendanceId: { in: ids } } });
  await prisma.attendance.deleteMany({ where: { employeeId } });
  await prisma.employee.delete({ where: { id: employeeId } });
  await prisma.department.delete({ where: { id: departmentId } });
  await cleanActors(prefix);
});
describe('attendance management routes', () => {
  it('enforces permission and decides records', async () => {
    expect((await request(app).get('/api/attendance/approvals').set(user.header)).status).toBe(403);
    expect((await request(app).get('/api/attendance/approvals?status=PENDING').set(admin.header)).status).toBe(200);
    expect((await request(app).post(`/api/attendance/${ids[0]}/reject`).set(admin.header).send({})).status).toBe(400);
    expect((await request(app).post(`/api/attendance/${ids[0]}/approve`).set(admin.header).send({})).status).toBe(200);
    expect((await request(app).post(`/api/attendance/${ids[0]}/approve`).set(admin.header).send({})).status).toBe(409);
  });
  it('reports individual results for bulk decisions', async () => {
    const response = await request(app).post('/api/attendance/bulk-decide').set(admin.header).send({ ids, decision: 'REJECTED', note: 'review' });
    expect(response.status).toBe(200);
    expect(response.body.results.map((r: { status: number }) => r.status)).toEqual([409, 200]);
  });
  it('allows manual entry and scoped listing', async () => {
    const employees = await request(app).get('/api/attendance/manual/employees').set(admin.header);
    expect(employees.status).toBe(200);
    expect(employees.body.map((item: { id: string }) => item.id)).toContain(employeeId);
    const response = await request(app).post('/api/attendance/manual').set(admin.header).send({ employeeId, date: '2026-03-04', checkIn: '09:00', checkOut: '18:00', note: 'Manual entry' });
    expect(response.status).toBe(201);
    ids.push(response.body.id);
    expect((await request(app).get('/api/attendance?date=2026-03-04').set(admin.header)).body).toHaveLength(1);
    const editable = await request(app).get('/api/attendance/manual/records?date=2026-03-04').set(admin.header);
    expect(editable.status).toBe(200);
    expect(editable.body[0].id).toBe(response.body.id);
  });
});
