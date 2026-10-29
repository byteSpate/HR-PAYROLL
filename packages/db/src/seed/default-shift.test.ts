import { expect, it, vi } from 'vitest';
import { DEFAULT_SHIFT_NAME, seedDefaultShift } from './default-shift.js';

it('creates the company default shift once and leaves an edited one alone', async () => {
  const rows = new Map<string, { name: string; startTime: string }>();
  const client = {
    shift: {
      findFirst: vi.fn(
        async ({ where }: { where: { name: string } }) => rows.get(where.name) ?? null,
      ),
      create: vi.fn(async ({ data }: { data: { name: string; startTime: string } }) => {
        rows.set(data.name, data);
        return data;
      }),
    },
  };

  await seedDefaultShift(client as never);
  expect(rows.get(DEFAULT_SHIFT_NAME)).toMatchObject({
    startTime: '09:00',
    endTime: '18:00',
    breakMinutes: 60,
    graceMinutes: 15,
    weeklyOffDays: [5],
  });

  rows.set(DEFAULT_SHIFT_NAME, { name: DEFAULT_SHIFT_NAME, startTime: '08:00' });
  await seedDefaultShift(client as never);
  expect(client.shift.create).toHaveBeenCalledTimes(1);
  expect(rows.get(DEFAULT_SHIFT_NAME)?.startTime).toBe('08:00');
});
