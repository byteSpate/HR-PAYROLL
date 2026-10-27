import { afterEach, describe, expect, it } from 'vitest';
import { prisma } from '@erp/db';
import { diffFields, listAudit, writeAudit } from './index.js';

const ENTITY = 'ZZTEST_AUDIT';

afterEach(async () => {
  await prisma.auditLog.deleteMany({ where: { entity: ENTITY } });
});

describe('diffFields', () => {
  it('keeps only the keys whose values changed', () => {
    expect(diffFields({ a: 1, b: 2 }, { a: 1, b: 3 })).toEqual({ before: { b: 2 }, after: { b: 3 } });
  });

  it('returns null when nothing changed', () => {
    expect(diffFields({ a: 1, b: 'x' }, { a: 1, b: 'x' })).toBeNull();
  });

  it('compares dates by value', () => {
    expect(diffFields({ d: new Date('2026-01-01') }, { d: new Date('2026-01-01') })).toBeNull();
  });
});

describe('listAudit', () => {
  it('pages newest first with a cursor and no duplicates', async () => {
    for (let i = 0; i < 5; i += 1) {
      // Distinct timestamps keep newest-first ordering deterministic.
      await new Promise((r) => setTimeout(r, 3));
      await prisma.$transaction((tx) =>
        writeAudit(tx, { entity: ENTITY, entityId: `e${i}`, action: 'CREATE', changedBy: 'nobody' }),
      );
    }
    const first = await listAudit(prisma, { entity: ENTITY, limit: 2 });
    const second = await listAudit(prisma, { entity: ENTITY, limit: 2, cursor: first.nextCursor! });
    const third = await listAudit(prisma, { entity: ENTITY, limit: 2, cursor: second.nextCursor! });

    const ids = [...first.items, ...second.items, ...third.items].map((r) => r.entityId);
    expect(ids).toEqual(['e4', 'e3', 'e2', 'e1', 'e0']);
    expect(third.nextCursor).toBeNull();
  });

  it('filters by entity id and caps the limit at 200', async () => {
    await prisma.$transaction((tx) =>
      writeAudit(tx, { entity: ENTITY, entityId: 'only', action: 'UPDATE', changedBy: 'nobody' }),
    );
    const page = await listAudit(prisma, { entity: ENTITY, entityId: 'only', limit: 10_000 });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({ action: 'UPDATE', actorEmail: null });
  });
});
