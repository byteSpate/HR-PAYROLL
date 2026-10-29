import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '@erp/db';
import { officeToday } from '@erp/export';
import { createApp } from '../../app.js';
import { cleanActors, makeActor } from '../../test-utils/access.js';

// The shapes the screens copied from HR-MNG-V1 read; the service tests cover the rules behind them.
const prefix = 'zzleavewire';
const app = createApp();
let admin: Awaited<ReturnType<typeof makeActor>>;
let user: Awaited<ReturnType<typeof makeActor>>;
let other: Awaited<ReturnType<typeof makeActor>>;
let reader: Awaited<ReturnType<typeof makeActor>>;
let employeeId: string;
let otherEmployeeId: string;
let typeId: string;
let deptId: string;
let requestId: string;
const stamp = Date.now();

beforeAll(async () => {
  admin = await makeActor(prefix, 'ADMIN');
  user = await makeActor(prefix, 'STANDARD');
  other = await makeActor(prefix, 'STANDARD');
  reader = await makeActor(prefix, 'STANDARD', ['leave.read:all']);
  deptId = (await prisma.department.create({ data: { name: `${prefix}-${stamp}` } })).id;
  const base = { designation: 'Engineer', departmentId: deptId, employmentType: 'FULL_TIME' as const, joiningDate: new Date('2025-01-01T00:00:00Z') };
  employeeId = (await prisma.employee.create({ data: { ...base, userId: user.user.id, employeeCode: `${prefix}-a-${stamp}`, fullName: 'Wire User' } })).id;
  otherEmployeeId = (await prisma.employee.create({ data: { ...base, userId: other.user.id, employeeCode: `${prefix}-b-${stamp}`, fullName: 'Wire Other' } })).id;
  typeId = (await prisma.leaveType.create({ data: { code: `${prefix}-${stamp}`, name: `${prefix}-${stamp}`, annualQuota: 10, eligibleFor: ['FULL_TIME'] } })).id;
  requestId = (await request(app).post('/api/leave/requests').set(user.header).send({ leaveTypeId: typeId, startDate: '2027-01-04', endDate: '2027-01-04' })).body.id;
  await prisma.leaveRequest.create({ data: { employeeId: otherEmployeeId, leaveTypeId: typeId, startDate: new Date('2027-02-01T00:00:00Z'), endDate: new Date('2027-02-01T00:00:00Z'), chargedDays: 1 } });
});
afterAll(async () => {
  await prisma.outboxEvent.deleteMany({ where: { payload: { path: ['requestId'], equals: requestId } } });
  await prisma.auditLog.deleteMany({ where: { entity: 'LEAVE_REQUEST', entityId: requestId } });
  await prisma.notification.deleteMany({ where: { userId: { in: [admin.user.id, user.user.id, other.user.id] } } });
  await prisma.leaveRequest.deleteMany({ where: { employeeId: { in: [employeeId, otherEmployeeId] } } });
  await prisma.leaveBalance.deleteMany({ where: { employeeId: { in: [employeeId, otherEmployeeId] } } });
  await prisma.leaveType.delete({ where: { id: typeId } });
  await prisma.employee.deleteMany({ where: { id: { in: [employeeId, otherEmployeeId] } } });
  await prisma.department.delete({ where: { id: deptId } });
  await cleanActors(prefix);
});

describe('GET /api/leave/requests', () => {
  it('returns each request in the shape the leave screens read', async () => {
    const res = await request(app).get('/api/leave/requests').set(user.header);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      id: requestId,
      employee: { id: employeeId, fullName: 'Wire User', employeeCode: `${prefix}-a-${stamp}` },
      leaveType: { id: typeId, code: `${prefix}-${stamp}`, name: `${prefix}-${stamp}`, isPaid: true },
      startDate: '2027-01-04', endDate: '2027-01-04', startSession: 'FIRST_HALF', endSession: 'SECOND_HALF',
      days: 1, reason: null, status: 'PENDING', decidedBy: null, decidedAt: null, decisionNote: null,
    });
    expect(typeof res.body[0].createdAt).toBe('string');
  });

  it('shows a person their own requests only, and a leave.read holder everyone they reach', async () => {
    expect((await request(app).get('/api/leave/requests').set(other.header)).body.map((r: { employee: { id: string } }) => r.employee.id)).toEqual([otherEmployeeId]);
    const all = await request(app).get('/api/leave/requests').set(reader.header);
    expect(all.body.map((r: { employee: { id: string } }) => r.employee.id).sort()).toEqual([employeeId, otherEmployeeId].sort());
  });

  it('names who decided a request', async () => {
    await request(app).post(`/api/leave/requests/${requestId}/approve`).set(admin.header);
    const row = (await request(app).get('/api/leave/requests').set(user.header)).body[0];
    expect(row).toMatchObject({ status: 'APPROVED', decidedBy: { id: admin.user.id, email: admin.user.email, fullName: null } });
    expect(typeof row.decidedAt).toBe('string');
  });
});

describe('GET /api/leave/balances/me', () => {
  it('reports entitlement, used and pending beside the balance', async () => {
    const mine = (await request(app).get('/api/leave/balances/me?year=2027').set(other.header)).body;
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ leaveTypeId: typeId, code: `${prefix}-${stamp}`, isPaid: true, annualQuota: 10, entitlement: 10, used: 0, pending: 1, balance: 10, accrual: null });
  });
});

describe('GET /api/leave/team-status', () => {
  it('lists the people the caller reaches with who is on leave today', async () => {
    const today = officeToday();
    const row = await prisma.leaveRequest.create({ data: { employeeId, leaveTypeId: typeId, startDate: today, endDate: today, chargedDays: 1, status: 'APPROVED' } });
    try {
      expect((await request(app).get('/api/leave/team-status').set(user.header)).status).toBe(403);
      const res = await request(app).get('/api/leave/team-status').set(admin.header);
      expect(res.status).toBe(200);
      const away = res.body.find((m: { id: string }) => m.id === employeeId);
      expect(away).toMatchObject({ fullName: 'Wire User', employeeCode: `${prefix}-a-${stamp}`, designation: 'Engineer', status: 'ON_LEAVE', currentLeave: { leaveTypeName: `${prefix}-${stamp}` } });
      expect(res.body.find((m: { id: string }) => m.id === otherEmployeeId)).toMatchObject({ status: 'ACTIVE', currentLeave: null });
    } finally { await prisma.leaveRequest.delete({ where: { id: row.id } }); }
  });
});

describe('GET /api/leave/half-day-window', () => {
  it('gives the shift window a half day is measured against, for one date', async () => {
    const res = await request(app).get('/api/leave/half-day-window?date=2027-01-04').set(user.header);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ startTime: '09:00', midpoint: '13:30', endTime: '18:00' });
    expect((await request(app).get('/api/leave/half-day-window?date=nope').set(user.header)).status).toBe(400);
    expect((await request(app).get('/api/leave/half-day-window?date=2027-01-04')).status).toBe(401);
  });
});
