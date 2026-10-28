import { describe, expect, it } from 'vitest';
import type { AccessContext } from '@erp/auth/permissions';
import type { NavGroup, NavItem } from '@erp/contracts';
import { filterNav } from './filter-nav';

const item = (label: string, href: string, permission: string | string[] | null, children?: NavItem['children']): NavItem => ({
  label,
  href,
  icon: 'RiCircleLine',
  permission,
  ...(children ? { children } : {}),
});

const child = (label: string, href: string, permission: string | string[] | null) => ({ label, href, permission });

const standard = (...grants: string[]): AccessContext => ({ accessLevel: 'STANDARD', grants });

const group = (label: string, items: NavGroup['items']): NavGroup => ({ label, order: 0, items });

describe('filterNav', () => {
  it('keeps only items whose permission is granted', () => {
    const groups = [group('Settings', [item('A', '/a', 'a.view'), item('B', '/b', 'b.view')])];
    const [visible] = filterNav(groups, standard('a.view'));
    expect(visible?.items.map((i) => i.label)).toEqual(['A']);
  });

  it('drops a heading when every item is forbidden', () => {
    const groups = [group('Settings', [item('A', '/a', 'a.view')])];
    expect(filterNav(groups, standard())).toEqual([]);
  });

  it('honours scopes and any-of lists, and shows everything to an admin', () => {
    const groups = [group('G', [item('A', '/a', 'a.view:department'), item('B', '/b', ['b.view', 'c.view'])])];
    const labels = (access: AccessContext) => filterNav(groups, access)[0]?.items.map((i) => i.label);
    expect(labels(standard('a.view:all'))).toEqual(['A']);
    expect(labels(standard('a.view:team'))).toBeUndefined();
    expect(labels(standard('c.view'))).toEqual(['B']);
    expect(labels({ accessLevel: 'ADMIN', grants: [] })).toEqual(['A', 'B']);
  });

  it('shows a team-scoped item to a holder of a wider scope', () => {
    const groups = [group('HR', [item('People', '/people', 'employee.read:team')])];
    const [visible] = filterNav(groups, standard('employee.read:department'));
    expect(visible?.items.map((i) => i.label)).toEqual(['People']);
  });

  it('always shows items with a null permission', () => {
    const groups = [group('Home', [item('Dash', '/dash', null)])];
    expect(filterNav(groups, standard())).toHaveLength(1);
  });
});

describe('filterNav with collapsible items', () => {
  const attendance = item('Attendance', '/attendance', null, [
    child('Approvals', '/attendance/approvals', 'attendance.approve:team'),
    child('Today', '/attendance', 'attendance.read:team'),
    child('Holidays', '/attendance/holidays', null),
  ]);

  it('keeps only the children the user may open', () => {
    const [visible] = filterNav([group('Overview', [attendance])], standard('attendance.read:team'));
    expect(visible?.items[0]?.children?.map((c) => c.label)).toEqual(['Today', 'Holidays']);
  });

  it('ignores the parent permission and decides from its children alone', () => {
    const gated = item('Leave', '/leave', 'leave.never', [child('Types', '/leave/types', null)]);
    expect(filterNav([group('Overview', [gated])], standard())[0]?.items.map((i) => i.label)).toEqual(['Leave']);
  });

  it('hides a collapsible item when none of its children is allowed', () => {
    const closed = item('Payroll', '/payroll', null, [child('Runs', '/payroll/runs', 'payroll.run.read')]);
    expect(filterNav([group('Overview', [closed])], standard())).toEqual([]);
  });

  it('does not change the manifest it was given', () => {
    const groups = [group('Overview', [attendance])];
    filterNav(groups, standard());
    expect(attendance.children).toHaveLength(3);
  });
});
