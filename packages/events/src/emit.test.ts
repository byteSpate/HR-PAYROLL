import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { prisma } from '@erp/db';
import { emit } from './emit.js';

describe('emit', () => {
  it('leaves no outbox row when the transaction rolls back', async () => {
    const boom = new Error('rollback');
    let id = '';

    await expect(
      prisma.$transaction(async (tx) => {
        ({ id } = await emit(tx, 'test.happened', { marker: randomUUID() }));
        throw boom;
      }),
    ).rejects.toBe(boom);

    expect(await prisma.outboxEvent.findUnique({ where: { id } })).toBeNull();
  });

  it('commits exactly one undelivered row when the transaction commits', async () => {
    const marker = randomUUID();
    const { id } = await prisma.$transaction((tx) =>
      emit(tx, 'test.happened', { marker }),
    );

    try {
      const row = await prisma.outboxEvent.findUnique({ where: { id } });
      expect(row).toMatchObject({
        type: 'test.happened',
        payload: { marker },
        deliveredAt: null,
        attempts: 0,
      });
    } finally {
      await prisma.outboxEvent.deleteMany({ where: { id } });
    }
  });
});
