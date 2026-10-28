import { describe, expect, it } from 'vitest';
import { computeEntitlement, entitlementFor, earnedAccrual } from './leave.policy.js';
describe('leave entitlement', () => {
  const joined = new Date('2026-10-01T00:00:00Z');
  it('pro-rates the joining year', () => expect(computeEntitlement(12, joined, 2026)).toBe(3));
  it('does not pro-rate a per-event entitlement', () => expect(entitlementFor({ accrualBasis: 'PER_EVENT', annualQuota: 112 }, joined, 2026, 0)).toBe(112));
  it('awards no earned leave before the minimum service and caps accrual', () => {
    expect(earnedAccrual(360, joined, new Date('2027-03-01T00:00:00Z'), 12, 60)).toBe(0);
    expect(earnedAccrual(360, joined, new Date('2028-01-01T00:00:00Z'), 12, 10)).toBe(10);
  });
});
