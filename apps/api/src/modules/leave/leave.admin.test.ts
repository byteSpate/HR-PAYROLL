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
beforeAll(async () => { admin = await makeActor(prefix, 'ADMIN'); user = await makeActor(prefix, 'STANDARD'); });
afterAll(async () => { if (typeId) { await prisma.auditLog.deleteMany({ where: { entity: 'LEAVE_TYPE', entityId: typeId } }); await prisma.leaveType.deleteMany({ where: { id: typeId } }); } await cleanActors(prefix); });
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
});
