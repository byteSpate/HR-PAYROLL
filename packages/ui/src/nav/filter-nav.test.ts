import { describe, expect, it } from 'vitest';
import type { AccessContext } from '@erp/auth/permissions';
import type { NavGroup } from '@erp/contracts';
import { filterNav } from './filter-nav';

const item = (label: string, href: string, permission: string | string[] | null) => ({
  label,
  href,
  icon: 'RiCircleLine',
  permission,
});

const standard = (...grants: string[]): AccessContext => ({ accessLevel: 'STANDARD', grants });

const group = (label: string, items: NavGroup['items']): NavGroup => ({
  label,
  order: 0,
  icon: 'RiSettings3Line',
  items,
});

describe('filterNav', () => {
  it('keeps only items whose permission is granted', () => {
    const groups = [group('Settings', [item('A', '/a', 'a.view'), item('B', '/b', 'b.view')])];
    const [visible] = filterNav(groups, standard('a.view'), '/');
    expect(visible?.items.map((i) => i.label)).toEqual(['A']);
  });

  it('drops a group when every item is forbidden', () => {
    const groups = [group('Settings', [item('A', '/a', 'a.view')])];
    expect(filterNav(groups, standard(), '/')).toEqual([]);
  });

  it('honours scopes and any-of lists, and shows everything to an admin', () => {
    const groups = [group('G', [item('A', '/a', 'a.view:department'), item('B', '/b', ['b.view', 'c.view'])])];
    const labels = (access: AccessContext) => filterNav(groups, access, '/')[0]?.items.map((i) => i.label);
    expect(labels(standard('a.view:all'))).toEqual(['A']);
    expect(labels(standard('a.view:team'))).toBeUndefined();
    expect(labels(standard('c.view'))).toEqual(['B']);
    expect(labels({ accessLevel: 'ADMIN', grants: [] })).toEqual(['A', 'B']);
  });

  it('shows a team-scoped item to a holder of a wider scope', () => {
    const groups = [group('HR', [item('People', '/people', 'employee.read:team')])];
    const [visible] = filterNav(groups, standard('employee.read:department'), '/');
    expect(visible?.items.map((i) => i.label)).toEqual(['People']);
  });

  it('always shows items with a null permission', () => {
    const groups = [group('Home', [item('Dash', '/dash', null)])];
    expect(filterNav(groups, standard(), '/')).toHaveLength(1);
  });

  it('marks the group active with the longest matching href', () => {
    const groups = [
      group('Settings', [
        item('Settings', '/settings', null),
        item('Roles', '/settings/roles', null),
      ]),
    ];
    const [visible] = filterNav(groups, standard(), '/settings/roles/abc');
    expect(visible?.active).toBe(true);
    expect(visible?.activeHref).toBe('/settings/roles');
  });

  it('does not match a path that merely shares a prefix', () => {
    const groups = [group('Settings', [item('Roles', '/settings', null)])];
    const [visible] = filterNav(groups, standard(), '/settingsx');
    expect(visible?.active).toBe(false);
    expect(visible?.activeHref).toBeNull();
  });
});
