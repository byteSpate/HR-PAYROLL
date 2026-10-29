import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_SHIFT_NAME, prisma, seedDefaultShift } from '@erp/db';
import { DEFAULT_SHIFT, createShift, deleteShift, effectiveShift, updateShift } from './shift.service.js';

const PREFIX = 'zzshift';
const base = { startTime: '09:00', endTime: '18:00', breakMinutes: 60, graceMinutes: 15, weeklyOffDays: [5] };
const make = (name: string, over: Record<string, unknown> = {}) => createShift({ ...base, name: `${PREFIX} ${name}`, ...over }, 'u-test');
// The HTTP error handler turns a ZodError into 400; at the service level it is the name that says so.
const status = (p: Promise<unknown>) => p.then(() => 0, (e: { status?: number; name: string }) => e.status ?? (e.name === 'ZodError' ? 400 : -1));

afterEach(async () => {
  const shifts = await prisma.shift.findMany({ where: { name: { startsWith: PREFIX } } });
  await prisma.employee.updateMany({ where: { shiftId: { in: shifts.map((s) => s.id) } }, data: { shiftId: null } });
  await prisma.auditLog.deleteMany({ where: { entity: 'SHIFT', entityId: { in: shifts.map((s) => s.id) } } });
  await prisma.shift.deleteMany({ where: { id: { in: shifts.map((s) => s.id) } } });
});

describe('createShift', () => {
  it('stores a standing shift and audits it', async () => {
    const s = await make('Standard');
    expect(s).toMatchObject({ startTime: '09:00', weeklyOffDays: [5], effectiveFrom: null, employeeCount: 0 });
    expect(await prisma.auditLog.count({ where: { entity: 'SHIFT', entityId: s.id, action: 'CREATE' } })).toBe(1);
  });

  it('refuses a duplicate name with 409', async () => {
    await make('Dup');
    expect(await status(make('Dup'))).toBe(409);
  });

  it('refuses a half-dated or backwards window with 400', async () => {
    expect(await status(make('Half', { effectiveFrom: '2026-03-01' }))).toBe(400);
    expect(await status(make('Back', { effectiveFrom: '2026-03-10', effectiveTo: '2026-03-01' }))).toBe(400);
  });

  it('refuses overlapping dated overrides with 409 and allows adjacent ones', async () => {
    await make('Ramadan', { effectiveFrom: '2026-03-01', effectiveTo: '2026-03-30' });
    expect(await status(make('Clash', { effectiveFrom: '2026-03-30', effectiveTo: '2026-04-05' }))).toBe(409);
    expect(await status(make('Inside', { effectiveFrom: '2026-03-10', effectiveTo: '2026-03-11' }))).toBe(409);
    expect(await status(make('After', { effectiveFrom: '2026-03-31', effectiveTo: '2026-04-05' }))).toBe(0);
  });

  it('does not let a standing shift clash with a dated one', async () => {
    await make('Dated', { effectiveFrom: '2026-03-01', effectiveTo: '2026-03-30' });
    expect(await status(make('Standing'))).toBe(0);
  });
});

describe('updateShift', () => {
  it('lets a dated shift keep its own window, but not move onto another', async () => {
    const a = await make('A', { effectiveFrom: '2026-03-01', effectiveTo: '2026-03-10' });
    await make('B', { effectiveFrom: '2026-03-20', effectiveTo: '2026-03-30' });
    expect(await status(updateShift(a.id, { ...base, name: a.name, effectiveFrom: '2026-03-02', effectiveTo: '2026-03-12' }, 'u'))).toBe(0);
    expect(await status(updateShift(a.id, { ...base, name: a.name, effectiveFrom: '2026-03-25', effectiveTo: '2026-03-28' }, 'u'))).toBe(409);
  });

  it('answers 404 for an unknown shift', async () => {
    expect(await status(updateShift('00000000-0000-4000-8000-000000000000', { ...base, name: `${PREFIX} X` }, 'u'))).toBe(404);
  });
});

describe('deleteShift', () => {
  it('refuses while employees are assigned, then deletes once they are not', async () => {
    const s = await make('Busy');
    const user = await prisma.user.create({ data: { email: `${PREFIX}-u-${Date.now()}@example.com`, passwordHash: 'x' } });
    const dept = await prisma.department.create({ data: { name: `${PREFIX} dept ${Date.now()}` } });
    const emp = await prisma.employee.create({
      data: {
        userId: user.id, employeeCode: `ZZS-${Date.now()}`, fullName: 'Shift Person', designation: 'Eng', departmentId: dept.id,
        employmentType: 'FULL_TIME', joiningDate: new Date('2026-01-05T00:00:00Z'), shiftId: s.id,
      },
    });
    try {
      expect(await status(deleteShift(s.id, 'u'))).toBe(409);
      await prisma.employee.update({ where: { id: emp.id }, data: { shiftId: null } });
      expect(await status(deleteShift(s.id, 'u'))).toBe(0);
    } finally {
      await prisma.employee.delete({ where: { id: emp.id } });
      await prisma.user.delete({ where: { id: user.id } });
      await prisma.department.delete({ where: { id: dept.id } });
    }
  });
});

describe('the company default shift', () => {
  const general = async () => {
    await seedDefaultShift(prisma);
    return prisma.shift.findFirstOrThrow({ where: { name: DEFAULT_SHIFT_NAME } });
  };

  it('cannot be renamed or deleted, since attendance resolves it by name', async () => {
    const row = await general();
    expect(await status(updateShift(row.id, { ...base, name: 'Renamed' }, 'u-test'))).toBe(409);
    expect(await status(deleteShift(row.id, 'u-test'))).toBe(409);
    expect(await prisma.shift.count({ where: { id: row.id, name: DEFAULT_SHIFT_NAME } })).toBe(1);
  });

  it('can have its hours changed, which is how HR moves the whole company', async () => {
    const row = await general();
    try {
      const { shift } = await updateShift(row.id, { ...base, name: DEFAULT_SHIFT_NAME, startTime: '08:30' }, 'u-test');
      expect(shift.startTime).toBe('08:30');
    } finally {
      await prisma.shift.update({ where: { id: row.id }, data: { startTime: row.startTime } });
    }
  });
});

describe('effectiveShift', () => {
  const at = (ymd: string) => new Date(`${ymd}T00:00:00Z`);
  const row = (name: string, from?: string, to?: string) =>
    ({ id: name, name, ...base, effectiveFrom: from ? at(from) : null, effectiveTo: to ? at(to) : null }) as never;

  it('uses the built-in default when nothing is assigned or dated', () => {
    expect(effectiveShift(at('2026-03-05'), null, [])).toBe(DEFAULT_SHIFT);
    expect(DEFAULT_SHIFT).toMatchObject({ startTime: '09:00', endTime: '18:00', weeklyOffDays: [5] });
  });

  it('uses the assigned shift outside any dated window', () => {
    const mine = row('mine');
    expect(effectiveShift(at('2026-03-05'), mine, [row('ramadan', '2026-04-01', '2026-04-30')])).toBe(mine);
  });

  it('lets a dated shift win over the assigned one inside its window, edges included', () => {
    const mine = row('mine');
    const ramadan = row('ramadan', '2026-03-01', '2026-03-30');
    expect(effectiveShift(at('2026-03-01'), mine, [ramadan])).toBe(ramadan);
    expect(effectiveShift(at('2026-03-30'), mine, [ramadan])).toBe(ramadan);
    expect(effectiveShift(at('2026-03-31'), mine, [ramadan])).toBe(mine);
  });
});
