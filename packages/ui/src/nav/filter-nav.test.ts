import { describe, expect, it } from 'vitest';
import type { NavGroup } from '@erp/contracts';
import { filterNav } from './filter-nav';

const item = (label: string, href: string, permission: string | null) => ({
  label,
  href,
  icon: 'RiCircleLine',
  permission: permission as `${string}.${string}` | null,
});

const group = (label: string, items: NavGroup['items']): NavGroup => ({
  label,
  icon: 'RiSettings3Line',
  items,
});

describe('filterNav', () => {
  it('keeps only items whose permission is granted', () => {
    const groups = [group('Settings', [item('A', '/a', 'a.view'), item('B', '/b', 'b.view')])];
    const [visible] = filterNav(groups, ['a.view'], '/');
    expect(visible?.items.map((i) => i.label)).toEqual(['A']);
  });

  it('drops a group when every item is forbidden', () => {
    const groups = [group('Settings', [item('A', '/a', 'a.view')])];
    expect(filterNav(groups, [], '/')).toEqual([]);
  });

  it('always shows items with a null permission', () => {
    const groups = [group('Home', [item('Dash', '/dash', null)])];
    expect(filterNav(groups, [], '/')).toHaveLength(1);
  });

  it('marks the group active with the longest matching href', () => {
    const groups = [
      group('Settings', [
        item('Settings', '/settings', null),
        item('Roles', '/settings/roles', null),
      ]),
    ];
    const [visible] = filterNav(groups, [], '/settings/roles/abc');
    expect(visible?.active).toBe(true);
    expect(visible?.activeHref).toBe('/settings/roles');
  });

  it('does not match a path that merely shares a prefix', () => {
    const groups = [group('Settings', [item('Roles', '/settings', null)])];
    const [visible] = filterNav(groups, [], '/settingsx');
    expect(visible?.active).toBe(false);
    expect(visible?.activeHref).toBeNull();
  });
});
