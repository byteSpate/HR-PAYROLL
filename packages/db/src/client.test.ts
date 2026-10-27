import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { prisma } from './client.js';

describe('prisma client', () => {
  it('rolls back writes when the transaction throws', async () => {
    const name = `t-${randomUUID()}`;
    const boom = new Error('rollback');

    await expect(
      prisma.$transaction(async (tx) => {
        await tx.role.create({ data: { name } });
        expect(await tx.role.findUnique({ where: { name } })).not.toBeNull();
        throw boom;
      }),
    ).rejects.toBe(boom);

    expect(await prisma.role.findUnique({ where: { name } })).toBeNull();
  });
});
