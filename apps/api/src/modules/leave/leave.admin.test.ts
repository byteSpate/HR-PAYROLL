import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '@erp/db';
import { createApp } from '../../app.js';
import { cleanActors, makeActor } from '../../test-utils/access.js';
const prefix = 'zzleadmin';
const app = createApp();
let admin: Awaited<ReturnType<typeof makeActor>>;
let user: Awaited<ReturnType<typeof makeActor>>;
let typeId: string;
const extra: string[] = [];
beforeAll(async () => { admin = await makeActor(prefix, 'ADMIN'); user = await makeActor(prefix, 'STANDARD'); });
afterAll(async () => { await prisma.auditLog.deleteMany({ where: { entity: 'LEAVE_TYPE', entityId: { in: extra } } }); await prisma.leaveType.deleteMany({ where: { id: { in: extra } } }); if (typeId) { await prisma.auditLog.deleteMany({ where: { entity: 'LEAVE_TYPE', entityId: typeId } }); await prisma.leaveType.deleteMany({ where: { id: typeId } }); } await cleanActors(prefix); });
describe('leave policy administration', () => {
  it('requires leave configuration permission and audits changes', async () => {
    const data = { code: `${prefix}-${Date.now()}`, name: `${prefix}-${Date.now()}`, annualQuota: 8, eligibleFor: ['FULL_TIME'] };
    expect((await request(app).post('/api/leave/types').set(user.header).send(data)).status).toBe(403);
    const created = await request(app).post('/api/leave/types').set(admin.header).send(data);
    expect(created.status).toBe(201); typeId = created.body.id;
    const updated = await request(app).patch(`/api/leave/types/${typeId}`).set(admin.header).send({ ...data, annualQuota: 9 });
    expect(updated.status).toBe(200);
    expect(updated.body.annualQuota).toBe(9);
    expect(await prisma.auditLog.count({ where: { entity: 'LEAVE_TYPE', entityId: typeId } })).toBe(2);
  });

  it('updates only the fields sent, so an edit to one never resets the rest to defaults', async () => {
    const stamp = Date.now();
    const created = await request(app).post('/api/leave/types').set(admin.header).send({ code: `${prefix}-p-${stamp}`, name: `${prefix}-p-${stamp}`, annualQuota: 8, carryForwardPct: 20, allowsHalfDay: false, eligibleFor: ['FULL_TIME'] });
    extra.push(created.body.id);
    const patched = await request(app).patch(`/api/leave/types/${created.body.id}`).set(admin.header).send({ annualQuota: 9 });
    expect(patched.status).toBe(200);
    expect(patched.body).toMatchObject({ annualQuota: 9, carryForwardPct: 20, allowsHalfDay: false });
    expect((await request(app).patch(`/api/leave/types/${created.body.id}`).set(admin.header).send({})).status).toBe(400);
  });

  it('never lets the client mark a type statutory, or change its code', async () => {
    const stamp = Date.now();
    const created = await request(app).post('/api/leave/types').set(admin.header).send({ code: `${prefix}-s-${stamp}`, name: `${prefix}-s-${stamp}`, annualQuota: 4, statutory: true, eligibleFor: ['FULL_TIME'] });
    extra.push(created.body.id);
    expect(created.body.statutory).toBe(false);
    const patched = await request(app).patch(`/api/leave/types/${created.body.id}`).set(admin.header).send({ annualQuota: 5, statutory: true, code: 'CHANGED' });
    expect(patched.body).toMatchObject({ statutory: false, code: `${prefix}-s-${stamp}` });
  });

  it('lets a statutory type go up but never below the Act, and never be deleted', async () => {
    const stamp = Date.now();
    const row = await prisma.leaveType.create({ data: { code: `${prefix}-t-${stamp}`, name: `${prefix}-t-${stamp}`, annualQuota: 10, statutory: true, eligibleFor: ['FULL_TIME'] } });
    extra.push(row.id);
    expect((await request(app).patch(`/api/leave/types/${row.id}`).set(admin.header).send({ annualQuota: 9 })).status).toBe(409);
    expect((await request(app).patch(`/api/leave/types/${row.id}`).set(admin.header).send({ accrualBasis: 'NONE' })).status).toBe(409);
    expect((await request(app).patch(`/api/leave/types/${row.id}`).set(admin.header).send({ annualQuota: 12 })).status).toBe(200);
    expect((await request(app).delete(`/api/leave/types/${row.id}`).set(admin.header)).status).toBe(409);
  });
});
