import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@erp/db';
import { listNotifications, markAllRead, markRead, unreadCount } from './query.js';

const PREFIX = 'zznotif-query';
let a = '';
let b = '';

const seed = async (userId: string, title: string, over: { readAt?: Date | null; ageMs?: number } = {}) =>
  prisma.notification.create({
    data: {
      userId,
      type: 'test.q',
      title,
      readAt: over.readAt ?? null,
      createdAt: new Date(Date.now() - (over.ageMs ?? 0)),
    },
  });

beforeAll(async () => {
  const mk = (n: string) => prisma.user.create({ data: { email: `${PREFIX}-${n}-${Date.now()}@example.com`, passwordHash: 'x' } });
  a = (await mk('a')).id;
  b = (await mk('b')).id;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
});

describe('listNotifications', () => {
  it('returns only that user, newest first, and pages with nextCursor', async () => {
    for (let i = 0; i < 5; i += 1) await seed(a, `a${i}`, { ageMs: (5 - i) * 1000 });
    await seed(b, 'b-only');

    const first = await listNotifications(a, { limit: 2 });
    const second = await listNotifications(a, { limit: 2, cursor: first.nextCursor! });
    const third = await listNotifications(a, { limit: 2, cursor: second.nextCursor! });

    expect([...first.items, ...second.items, ...third.items].map((n) => n.title)).toEqual(['a4', 'a3', 'a2', 'a1', 'a0']);
    expect(third.nextCursor).toBeNull();
  });

  it('can list unread only', async () => {
    await seed(a, 'already-read', { readAt: new Date() });
    const unread = await listNotifications(a, { unreadOnly: true, limit: 100 });
    expect(unread.items.every((n) => n.readAt === null)).toBe(true);
    expect(unread.items.some((n) => n.title === 'already-read')).toBe(false);
  });

  it('caps the limit at 100 and defaults to 20', async () => {
    const page = await listNotifications(a, {});
    expect(page.items.length).toBeLessThanOrEqual(20);
    const big = await listNotifications(a, { limit: 5000 });
    expect(big.items.length).toBeLessThanOrEqual(100);
  });
});

describe('unreadCount', () => {
  it('ignores read rows and other users', async () => {
    const c = await prisma.user.create({ data: { email: `${PREFIX}-c-${Date.now()}@example.com`, passwordHash: 'x' } });
    await seed(c.id, 'u1');
    await seed(c.id, 'u2');
    await seed(c.id, 'r', { readAt: new Date() });
    await seed(a, 'someone else');
    expect(await unreadCount(c.id)).toBe(2);
  });
});

describe('markRead', () => {
  it('rejects 404 for another user\'s notification and leaves it unread', async () => {
    const theirs = await seed(a, 'private');
    await expect(markRead(b, theirs.id)).rejects.toMatchObject({ status: 404 });
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: theirs.id } })).readAt).toBeNull();
  });

  it('marks your own, and marking it again is not an error', async () => {
    const mine = await seed(b, 'mine');
    await markRead(b, mine.id);
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: mine.id } })).readAt).not.toBeNull();
    await expect(markRead(b, mine.id)).resolves.toBeUndefined();
  });

  it('404s on an unknown id', async () => {
    await expect(markRead(a, '00000000-0000-4000-8000-000000000000')).rejects.toMatchObject({ status: 404 });
  });
});

describe('markAllRead', () => {
  it('reads only the caller\'s unread rows and returns how many changed', async () => {
    const d = await prisma.user.create({ data: { email: `${PREFIX}-d-${Date.now()}@example.com`, passwordHash: 'x' } });
    await seed(d.id, 'x1');
    await seed(d.id, 'x2');
    await seed(d.id, 'x3', { readAt: new Date() });
    const other = await seed(a, 'untouched');
    expect(await markAllRead(d.id)).toBe(2);
    expect(await markAllRead(d.id)).toBe(0);
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: other.id } })).readAt).toBeNull();
  });
});
