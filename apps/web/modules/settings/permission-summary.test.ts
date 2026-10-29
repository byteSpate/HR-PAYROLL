import { describe, expect, it } from 'vitest';
import type { DeclaredPermission } from '@erp/contracts';
import { summarizeGrants } from './permission-summary';

const declared: DeclaredPermission[] = [
  { key: 'attendance.view', label: 'View attendance', module: 'attendance', scopes: ['team', 'all'], managerDefault: false },
  { key: 'attendance.config', label: 'Manage shifts', module: 'attendance', scopes: [], managerDefault: false },
  { key: 'leave.read', label: 'View leave requests', module: 'leave', scopes: ['team', 'all'], managerDefault: false },
] as DeclaredPermission[];

describe('summarizeGrants', () => {
  it('groups by module in declaration order, with the label from the manifest', () => {
    expect(summarizeGrants(['leave.read:all', 'attendance.config'], declared)).toEqual([
      { module: 'attendance', items: [{ key: 'attendance.config', label: 'Manage shifts', scope: null }] },
      { module: 'leave', items: [{ key: 'leave.read', label: 'View leave requests', scope: 'all' }] },
    ]);
  });

  it('keeps only the widest scope held for a key', () => {
    const [group] = summarizeGrants(['attendance.view:team', 'attendance.view:all', 'attendance.view:own'], declared);
    expect(group?.items).toEqual([{ key: 'attendance.view', label: 'View attendance', scope: 'all' }]);
  });

  it('skips keys no manifest declares', () => {
    expect(summarizeGrants(['retired.thing'], declared)).toEqual([]);
  });

  it('returns nothing for no grants', () => {
    expect(summarizeGrants([], declared)).toEqual([]);
  });
});
