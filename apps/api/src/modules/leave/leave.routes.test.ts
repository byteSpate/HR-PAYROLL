import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '@erp/db';
import { officeToday } from '@erp/export';
import { createApp } from '../../app.js';
import { bearer, cleanActors, makeActor } from '../../test-utils/access.js';
const prefix = 'zzleaveroutes';
const app = createApp();
let admin: Awaited<ReturnType<typeof makeActor>>;
let user: Awaited<ReturnType<typeof makeActor>>;
let employeeId: string;
let typeId: string;
let deptId: string;
let requestId: string;
beforeAll(async () => {
  admin = await makeActor(prefix, 'ADMIN'); user = await makeActor(prefix, 'STANDARD');
  deptId = (await prisma.department.create({ data: { name: `${prefix}-${Date.now()}` } })).id;
  employeeId = (await prisma.employee.create({ data: { userId: user.user.id, employeeCode: `${prefix}-${Date.now()}`, fullName: 'Leave User', designation: 'Engineer', departmentId: deptId, employmentType: 'FULL_TIME', joiningDate: new Date('2025-01-01T00:00:00Z') } })).id;
  typeId = (await prisma.leaveType.create({ data: { code: `${prefix}-${Date.now()}`, name: `${prefix}-${Date.now()}`, annualQuota: 10, eligibleFor: ['FULL_TIME'] } })).id;
});
afterAll(async () => {
  if (requestId) await prisma.outboxEvent.deleteMany({ where: { payload: { path: ['requestId'], equals: requestId } } });
  if (requestId) await prisma.auditLog.deleteMany({ where: { entity: 'LEAVE_REQUEST', entityId: requestId } });
  await prisma.notification.deleteMany({ where: { userId: { in: [admin.user.id, user.user.id] } } });
  await prisma.leaveRequest.deleteMany({ where: { employeeId } }); await prisma.leaveBalance.deleteMany({ where: { employeeId } });
  await prisma.leaveType.delete({ where: { id: typeId } }); await prisma.employee.delete({ where: { id: employeeId } }); await prisma.department.delete({ where: { id: deptId } }); await cleanActors(prefix);
});
describe('leave routes', () => {
  it('allows an employee to apply and see their own requests and balances', async () => {
    expect((await request(app).get('/api/leave/types')).status).toBe(401);
    expect((await request(app).get('/api/leave/types').set(user.header)).status).toBe(200);
    expect((await request(app).get('/api/leave/config/employees').set(user.header)).status).toBe(403);
    const options = await request(app).get('/api/leave/config/employees').set(admin.header);
    expect(options.status).toBe(200);
    expect(options.body.map((item: { id: string }) => item.id)).toContain(employeeId);
    const initialBalances = await request(app).get('/api/leave/balances/me').set(user.header);
    expect(initialBalances.body).toHaveLength(1);
    expect(initialBalances.body[0].balance).toBe(10);
    const preview = await request(app).post('/api/leave/preview').set(user.header).send({ leaveTypeId: typeId, startDate: '2027-01-04', endDate: '2027-01-04' });
    expect(preview.status).toBe(200);
    expect(preview.body.chargedDays).toBe(1);
    const res = await request(app).post('/api/leave/requests').set(user.header).send({ leaveTypeId: typeId, startDate: '2027-01-04', endDate: '2027-01-04' });
    expect(res.status).toBe(201); requestId = res.body.id;
    expect((await request(app).get('/api/leave/requests').set(user.header)).body).toHaveLength(1);
    expect((await request(app).get('/api/leave/balances/me').set(user.header)).body).toHaveLength(1);
    expect((await request(app).get('/api/leave/requests').set(bearer(user.user.id, 'STANDARD', ['leave.read:all']))).body).toHaveLength(1);
  });
  it('shows approved leave today only to a viewer with leave read access', async () => {
    const today = officeToday();
    const row = await prisma.leaveRequest.create({ data: { employeeId, leaveTypeId: typeId, startDate: today, endDate: today, chargedDays: 1, status: 'APPROVED' } });
    try {
      expect((await request(app).get('/api/leave/team-status').set(user.header)).status).toBe(403);
      const result = await request(app).get('/api/leave/team-status').set(admin.header);
      expect(result.status).toBe(200);
      expect(result.body.find((item: { id: string }) => item.id === employeeId)).toMatchObject({ status: 'ON_LEAVE' });
    } finally { await prisma.leaveRequest.delete({ where: { id: row.id } }); }
  });
  it('allows an admin to approve, list, and cancel an approved future request', async () => {
    expect((await request(app).post(`/api/leave/requests/${requestId}/approve`).set(user.header)).status).toBe(403);
    expect((await request(app).post(`/api/leave/requests/${requestId}/approve`).set(admin.header)).status).toBe(200);
    expect((await request(app).get('/api/leave/requests').set(admin.header)).body).toHaveLength(1);
    expect((await request(app).post(`/api/leave/requests/${requestId}/cancel`).set(admin.header)).status).toBe(200);
  });
});
