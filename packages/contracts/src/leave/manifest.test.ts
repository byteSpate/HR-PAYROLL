import { expect, it } from 'vitest';
import { leave } from './manifest.js';
it('declares leave scope, navigation and events', () => {
  expect(leave.deps).toEqual(['core', 'employee', 'attendance']);
  expect(leave.permissions['leave.approve']).toMatchObject({ managerDefault: true, scopes: ['team', 'department', 'all'] });
  expect(leave.nav.flatMap((group: { items: { href: string }[] }) => group.items).map((item: { href: string }) => item.href)).toContain('/me/leave');
  expect(leave.events).toContain('leave.approved');
});
