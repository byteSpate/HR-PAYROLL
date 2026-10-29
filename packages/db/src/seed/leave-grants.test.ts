import { expect, it } from 'vitest';
import { STARTER_ROLES } from './starter-roles.js';
it('grants the HR Admin every leave permission', () => {
  const grants = STARTER_ROLES.find((role) => role.name === 'HR Admin')!.grants;
  for (const key of ['leave.read', 'leave.approve', 'leave.manage'])
    expect(grants).toContainEqual({ key, scope: 'all' });
  expect(grants).toContainEqual({ key: 'leave.config', scope: null });
});
