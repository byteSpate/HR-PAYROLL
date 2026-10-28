import { describe, expect, it } from 'vitest';
import { navGroups } from './nav';

describe('navGroups', () => {
  it('lists groups by their order, not by module registration', () => {
    const orders = navGroups.map((g) => g.order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
    expect(navGroups[0]?.label).toBe('Dashboard');
    expect(navGroups.at(-1)?.label).toBe('Settings');
  });
});
