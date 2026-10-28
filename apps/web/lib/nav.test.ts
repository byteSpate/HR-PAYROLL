import { describe, expect, it } from 'vitest';
import type { NavGroup } from '@erp/contracts';
import { mergeNavGroups, navGroups } from './nav';

const group = (label: string, order: number, ...items: string[]): NavGroup => ({
  label,
  order,
  items: items.map((name) => ({ label: name, href: `/${name}`, icon: 'RiCircleLine', permission: null })),
});

describe('mergeNavGroups', () => {
  it('folds groups that share a label into one, keeping every item in module order', () => {
    const merged = mergeNavGroups([group('My Space', 10, 'profile'), group('Other', 20, 'x'), group('My Space', 15, 'attendance')]);
    expect(merged.map((g) => g.label)).toEqual(['My Space', 'Other']);
    expect(merged[0]?.items.map((i) => i.label)).toEqual(['profile', 'attendance']);
  });

  it('orders the merged group by its lowest order', () => {
    const merged = mergeNavGroups([group('Late', 30, 'a'), group('Shared', 50, 'b'), group('Shared', 5, 'c')]);
    expect(merged.map((g) => g.label)).toEqual(['Shared', 'Late']);
  });

  it('does not mutate the manifests it was given', () => {
    const a = group('Shared', 1, 'a');
    mergeNavGroups([a, group('Shared', 2, 'b')]);
    expect(a.items).toHaveLength(1);
  });
});

describe('real navGroups', () => {
  it('has one Workspace heading holding personal pages from several modules', () => {
    const workspace = navGroups.filter((g) => g.label === 'Workspace');
    expect(workspace).toHaveLength(1);
    expect(workspace[0]?.items.map((i) => i.href)).toEqual(expect.arrayContaining(['/me', '/me/directory', '/me/attendance', '/me/leave']));
  });

  it('puts every admin-side module under Overview, with Attendance expanding into its own pages', () => {
    const overview = navGroups.find((g) => g.label === 'Overview');
    expect(overview?.items.map((i) => i.label)).toEqual(expect.arrayContaining(['Dashboard', 'Employees', 'Attendance', 'Leave']));
    const attendance = overview?.items.find((i) => i.label === 'Attendance');
    expect(attendance?.children?.map((c) => c.label)).toEqual(['Attendance Approvals', "Today's Attendance", 'Reports', 'Holiday Calendar']);
  });
});

describe('navGroups', () => {
  it('lists groups by their order, not by module registration', () => {
    const orders = navGroups.map((g) => g.order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
    expect(navGroups[0]?.label).toBe('Overview');
    expect(navGroups.at(-1)?.label).toBe('Administration');
  });
});
