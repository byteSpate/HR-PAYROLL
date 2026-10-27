import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { signAccessToken } from '@erp/auth';
import { env } from '../env.js';
import { errorHandler } from './error-handler.js';
import { requireAuth } from './require-auth.js';
import { requirePermission } from './require-permission.js';

const app = express();
app.get('/guarded', requireAuth, requirePermission('a.b'), (_req, res) => {
  res.json({ ok: true });
});
app.use(errorHandler);

const token = (permissions: string[]) => signAccessToken({ sub: 'u1', permissions }, env.JWT_ACCESS_SECRET, '5m');

describe('requirePermission', () => {
  it('401 without a token', async () => {
    expect((await request(app).get('/guarded')).status).toBe(401);
  });

  it('401 for a token signed with the wrong secret', async () => {
    const bad = signAccessToken({ sub: 'u1', permissions: ['a.b'] }, 'another-secret-0123456789', '5m');
    expect((await request(app).get('/guarded').set('Authorization', `Bearer ${bad}`)).status).toBe(401);
  });

  it('401 for a signed token with a malformed payload', async () => {
    const bad = signAccessToken({ sub: 1, permissions: 'a.b' } as never, env.JWT_ACCESS_SECRET, '5m');
    expect((await request(app).get('/guarded').set('Authorization', `Bearer ${bad}`)).status).toBe(401);
  });

  it('403 when the permission is missing', async () => {
    const res = await request(app).get('/guarded').set('Authorization', `Bearer ${token(['x.y'])}`);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden', permission: 'a.b' });
  });

  it('200 when the permission is granted', async () => {
    const res = await request(app).get('/guarded').set('Authorization', `Bearer ${token(['a.b'])}`);
    expect(res.status).toBe(200);
  });
});
