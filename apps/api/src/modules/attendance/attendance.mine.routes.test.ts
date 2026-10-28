import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '@erp/db';
import { createApp } from '../../app.js';
import { cleanActors, makeActor } from '../../test-utils/access.js';

const prefix = 'zzmineroutes';
const app = createApp();
let alice: Awaited<ReturnType<typeof makeActor>>;
let bob: Awaited<ReturnType<typeof makeActor>>;
let departmentId: string;
let employeeId: string;
let bobEmployeeId: string;

beforeAll(async () => {
  alice = await makeActor(prefix, 'STANDARD');
  bob = await makeActor(prefix, 'STANDARD');
  departmentId = (await prisma.department.create({ data: { name: `${prefix}-${Date.now()}` } })).id;
  employeeId = (await prisma.employee.create({ data: {
    userId: alice.user.id, employeeCode: `${prefix}-${Date.now()}`, fullName: 'Alice', designation: 'Engineer', departmentId,
    employmentType: 'FULL_TIME', joiningDate: new Date('2026-01-01T00:00:00Z'),
  } })).id;
  bobEmployeeId = (await prisma.employee.create({ data: {
    userId: bob.user.id, employeeCode: `${prefix}-bob-${Date.now()}`, fullName: 'Bob', designation: 'Engineer', departmentId,
    employmentType: 'FULL_TIME', joiningDate: new Date('2026-01-01T00:00:00Z'),
  } })).id;
});
afterAll(async () => {
  await prisma.attendance.deleteMany({ where: { employeeId: { in: [employeeId, bobEmployeeId] } } });
  await prisma.employee.deleteMany({ where: { id: { in: [employeeId, bobEmployeeId] } } });
  await prisma.department.delete({ where: { id: departmentId } });
  await cleanActors(prefix);
});

describe('my attendance routes', () => {
  it('requires authentication and an employee record', async () => {
    expect((await request(app).post('/api/attendance/check-in')).status).toBe(401);
    const noEmployee = await makeActor(prefix, 'STANDARD');
    expect((await request(app).post('/api/attendance/check-in').set(noEmployee.header)).status).toBe(403);
  });
  it('punches in and out, rejecting duplicates', async () => {
    expect((await request(app).post('/api/attendance/check-in').set(alice.header)).status).toBe(201);
    expect((await request(app).post('/api/attendance/check-in').set(alice.header)).status).toBe(409);
    expect((await request(app).post('/api/attendance/check-out').set(alice.header)).status).toBe(200);
  });
  it('returns only the caller’s requested month and rejects an invalid month', async () => {
    await prisma.attendance.create({ data: { employeeId, date: new Date('2026-03-02T00:00:00Z') } });
    await prisma.attendance.create({ data: { employeeId: bobEmployeeId, date: new Date('2026-03-03T00:00:00Z') } });
    const response = await request(app).get('/api/attendance/me?month=2026-03').set(alice.header);
    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].employeeId).toBe(employeeId);
    expect((await request(app).get('/api/attendance/me?month=bad').set(alice.header)).status).toBe(400);
    const bobResponse = await request(app).get('/api/attendance/me?month=2026-03').set(bob.header);
    expect(bobResponse.body).toHaveLength(1);
    expect(bobResponse.body[0].employeeId).toBe(bobEmployeeId);
  });
});
