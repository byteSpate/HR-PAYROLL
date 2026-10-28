import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '@erp/db';
import { createApp } from '../../app.js';
import { cleanActors, makeActor } from '../../test-utils/access.js';

const app = createApp();
const PREFIX = 'zznotifroutes';
let alice: Awaited<ReturnType<typeof makeActor>>;
let bob: Awaited<ReturnType<typeof makeActor>>;

const seed = (userId: string, title: string, readAt: Date | null = null) =>
  prisma.notification.create({ data: { userId, type: 'test.route', title, readAt } });

beforeAll(async () => {
  alice = await makeActor(PREFIX, 'STANDARD');
  bob = await makeActor(PREFIX, 'STANDARD');
});

afterAll(async () => {
  await cleanActors(PREFIX);
});

describe('notification routes', () => {
  it.each([
    ['get', '/api/notifications'],
    ['get', '/api/notifications/unread-count'],
    ['post', '/api/notifications/read-all'],
    ['post', '/api/notifications/abc/read'],
  ] as const)('answers 401 to %s %s without a token', async (method, path) => {
    expect((await request(app)[method](path)).status).toBe(401);
  });

  it('lists only the caller\'s notifications', async () => {
    await seed(alice.user.id, 'for alice');
    await seed(bob.user.id, 'for bob');
    const res = await request(app).get('/api/notifications').set(alice.header);
    expect(res.status).toBe(200);
    const titles = res.body.items.map((n: { title: string }) => n.title);
    expect(titles).toContain('for alice');
    expect(titles).not.toContain('for bob');
    expect(res.body).toHaveProperty('nextCursor');
  });

  it('filters to unread and honours the limit', async () => {
    await seed(alice.user.id, 'read one', new Date());
    const res = await request(app).get('/api/notifications?unreadOnly=true&limit=1').set(alice.header);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].readAt).toBeNull();
  });

  it('rejects a bad limit with 400', async () => {
    expect((await request(app).get('/api/notifications?limit=0').set(alice.header)).status).toBe(400);
  });

  it('counts the caller\'s unread notifications', async () => {
    const before = (await request(app).get('/api/notifications/unread-count').set(alice.header)).body.count;
    await seed(alice.user.id, 'one more');
    const after = (await request(app).get('/api/notifications/unread-count').set(alice.header)).body.count;
    expect(after).toBe(before + 1);
  });

  it('answers 404 when marking another user\'s notification and leaves it unread', async () => {
    const theirs = await seed(bob.user.id, 'bob private');
    expect((await request(app).post(`/api/notifications/${theirs.id}/read`).set(alice.header)).status).toBe(404);
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: theirs.id } })).readAt).toBeNull();
  });

  it('marks your own notification read with 204', async () => {
    const mine = await seed(alice.user.id, 'mine');
    expect((await request(app).post(`/api/notifications/${mine.id}/read`).set(alice.header)).status).toBe(204);
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: mine.id } })).readAt).not.toBeNull();
  });

  it('read-all returns the number it changed and leaves other users alone', async () => {
    const unreadBefore = await prisma.notification.count({ where: { userId: alice.user.id, readAt: null } });
    const bobUnread = await prisma.notification.count({ where: { userId: bob.user.id, readAt: null } });
    const res = await request(app).post('/api/notifications/read-all').set(alice.header);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ changed: unreadBefore });
    expect(await prisma.notification.count({ where: { userId: bob.user.id, readAt: null } })).toBe(bobUnread);
  });
});
