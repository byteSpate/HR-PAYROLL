import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@erp/db';
import { notify } from './notify.js';

const PREFIX = 'zznotif-notify';
let userId = '';

beforeAll(async () => {
  const user = await prisma.user.create({ data: { email: `${PREFIX}-${Date.now()}@example.com`, passwordHash: 'x' } });
  userId = user.id;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
});

const rows = () => prisma.notification.findMany({ where: { userId } });

describe('notify', () => {
  it('writes one row per input', async () => {
    await prisma.$transaction((tx) =>
      notify(tx, [
        { userId, type: 'a.one', title: 'One' },
        { userId, type: 'a.two', title: 'Two', body: 'b', href: '/x', entity: 'THING', entityId: '1' },
      ]),
    );
    const all = await rows();
    expect(all.map((r) => r.type).sort()).toEqual(['a.one', 'a.two']);
    expect(all.find((r) => r.type === 'a.two')).toMatchObject({ body: 'b', href: '/x', entity: 'THING', entityId: '1' });
  });

  it('writes one row when the same input arrives twice within a minute', async () => {
    const input = { userId, type: 'dup.type', title: 'Again', entity: 'REQ', entityId: '9' };
    await prisma.$transaction((tx) => notify(tx, input));
    await prisma.$transaction((tx) => notify(tx, input));
    await prisma.$transaction((tx) => notify(tx, [input, input]));
    expect(await prisma.notification.count({ where: { userId, type: 'dup.type' } })).toBe(1);
  });

  it('keeps notices for different records of the same type', async () => {
    await prisma.$transaction((tx) =>
      notify(tx, [
        { userId, type: 'rec.type', title: 'R1', entity: 'REQ', entityId: '1' },
        { userId, type: 'rec.type', title: 'R2', entity: 'REQ', entityId: '2' },
      ]),
    );
    expect(await prisma.notification.count({ where: { userId, type: 'rec.type' } })).toBe(2);
  });

  it('writes the same notice again once the minute has passed', async () => {
    await prisma.notification.create({
      data: { userId, type: 'old.type', title: 'Old', entity: 'REQ', entityId: '5', createdAt: new Date(Date.now() - 120_000) },
    });
    await prisma.$transaction((tx) => notify(tx, { userId, type: 'old.type', title: 'New', entity: 'REQ', entityId: '5' }));
    expect(await prisma.notification.count({ where: { userId, type: 'old.type' } })).toBe(2);
  });

  it('accepts an empty list', async () => {
    await expect(prisma.$transaction((tx) => notify(tx, []))).resolves.toBeUndefined();
  });
});
