import { expect, it } from 'vitest';
import { prisma } from '@erp/db';
it('stores leave types with a stable code and policy fields', async () => {
  const code = `ZZTEST-${Date.now()}`;
  const type = await prisma.leaveType.create({ data: { code, name: code, annualQuota: 10, eligibleFor: ['FULL_TIME'], statutory: false } });
  try { expect(type).toMatchObject({ countsHolidays: false, allowsHalfDay: true, accrualBasis: 'PRO_RATED' }); }
  finally { await prisma.leaveType.delete({ where: { id: type.id } }); }
});
