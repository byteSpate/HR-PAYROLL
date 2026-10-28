import { afterEach, describe, expect, it } from 'vitest';
import { prisma } from '@erp/db';
import { createHoliday, deleteHoliday, listHolidays, updateHoliday } from './holiday.service.js';

const PREFIX = 'zzhol';
const make = (name: string, date = '2026-05-01', type = 'GENERAL') => createHoliday({ name: `${PREFIX} ${name}`, date, type }, 'u-test');
// The HTTP error handler turns a ZodError into 400; at the service level it is the name that says so.
const status = (p: Promise<unknown>) => p.then(() => 0, (e: { status?: number; name: string }) => e.status ?? (e.name === 'ZodError' ? 400 : -1));

afterEach(async () => {
  const rows = await prisma.holiday.findMany({ where: { name: { startsWith: PREFIX } } });
  await prisma.auditLog.deleteMany({ where: { entity: 'HOLIDAY', entityId: { in: rows.map((r) => r.id) } } });
  await prisma.holiday.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
});

describe('holidays', () => {
  it('creates and lists a holiday with a plain date, and audits it', async () => {
    const h = await make('May Day');
    expect(h).toMatchObject({ date: '2026-05-01', type: 'GENERAL' });
    const listed = await listHolidays({ year: 2026 });
    expect(listed.some((x) => x.id === h.id)).toBe(true);
    expect(await prisma.auditLog.count({ where: { entity: 'HOLIDAY', entityId: h.id, action: 'CREATE' } })).toBe(1);
  });

  it('refuses a duplicate (date, name) with 409', async () => {
    await make('Same');
    expect(await status(make('Same'))).toBe(409);
  });

  it('allows two holidays on one date with different names', async () => {
    await make('May Day');
    expect(await status(make('Buddha Purnima'))).toBe(0);
  });

  it('accepts a WORKING_DAY override', async () => {
    expect((await make('Cancelled off-day', '2026-05-23', 'WORKING_DAY')).type).toBe('WORKING_DAY');
  });

  it('rejects an invalid date or type with 400', async () => {
    expect(await status(make('Bad', '2026-13-40'))).toBe(400);
    expect(await status(make('Bad', '2026-05-01', 'NOPE'))).toBe(400);
  });

  it('filters by year', async () => {
    await make('Old', '2025-12-25');
    const only2025 = await listHolidays({ year: 2025 });
    expect(only2025.some((h) => h.name === `${PREFIX} Old`)).toBe(true);
    expect((await listHolidays({ year: 2026 })).some((h) => h.name === `${PREFIX} Old`)).toBe(false);
  });

  it('updates, refusing a rename onto an existing (date, name)', async () => {
    const a = await make('A');
    await make('B');
    expect(await status(updateHoliday(a.id, { name: `${PREFIX} B`, date: '2026-05-01', type: 'GENERAL' }, 'u'))).toBe(409);
    const ok = await updateHoliday(a.id, { name: `${PREFIX} A2`, date: '2026-05-02', type: 'OPTIONAL' }, 'u');
    expect(ok).toMatchObject({ date: '2026-05-02', type: 'OPTIONAL' });
  });

  it('deletes, then answers 404', async () => {
    const h = await make('Temp');
    expect(await status(deleteHoliday(h.id, 'u'))).toBe(0);
    expect(await status(deleteHoliday(h.id, 'u'))).toBe(404);
  });
});
