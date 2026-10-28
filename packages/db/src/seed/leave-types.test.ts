import { expect, it, vi } from 'vitest';
import { seedLeaveTypes } from './leave-types.js';
it('creates missing types, updates statutory rows and preserves edited non-statutory rows on reseed', async () => {
  const rows = new Map<string, { code: string; statutory: boolean; annualQuota: number }>();
  const client = { leaveType: {
    findUnique: vi.fn(async ({ where }: { where: { code: string } }) => rows.get(where.code) ?? null),
    create: vi.fn(async ({ data }: { data: { code: string; statutory: boolean; annualQuota: number } }) => { rows.set(data.code, data); return data; }),
    update: vi.fn(async ({ where, data }: { where: { code: string }; data: { code: string; statutory: boolean; annualQuota: number } }) => { rows.set(where.code, data); return data; }),
  } };
  await seedLeaveTypes(client as never);
  rows.set('PERSONAL', { code: 'PERSONAL', statutory: false, annualQuota: 25 });
  rows.set('CASUAL', { code: 'CASUAL', statutory: true, annualQuota: 1 });
  await seedLeaveTypes(client as never);
  expect(rows.get('PERSONAL')?.annualQuota).toBe(25);
  expect(rows.get('CASUAL')?.annualQuota).toBe(10);
  expect(rows.size).toBe(6);
});
