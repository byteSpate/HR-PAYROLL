import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '@erp/db';
import { createApp } from '../../app.js';
import { bearer } from '../../test-utils/access.js';

const app = createApp();
const ENTITY = 'ZZTEST_AUDIT_ROUTE';

afterEach(async () => {
  await prisma.auditLog.deleteMany({ where: { entity: ENTITY } });
});

describe('GET /api/audit', () => {
  it('requires audit.read', async () => {
    const res = await request(app).get('/api/audit').set(bearer('u-none', 'STANDARD', []));
    expect(res.status).toBe(403);
  });

  it('lists rows newest first for holders of audit.read', async () => {
    await prisma.auditLog.create({ data: { entity: ENTITY, entityId: 'a', action: 'CREATE' } });
    const res = await request(app)
      .get(`/api/audit?entity=${ENTITY}&limit=5`)
      .set(bearer('u-reader', 'STANDARD', ['audit.read']));
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({ entityId: 'a', action: 'CREATE' });
    expect(res.body.nextCursor).toBeNull();
  });

  it('rejects a non-numeric limit', async () => {
    const res = await request(app).get('/api/audit?limit=lots').set(bearer('u-reader', 'STANDARD', ['audit.read']));
    expect(res.status).toBe(400);
  });
});
