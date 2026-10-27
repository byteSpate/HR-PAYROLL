import { describe, expect, it } from 'vitest';
import { allPermissions, modules } from '../registry.js';
import { departmentInputSchema } from './schemas.js';

describe('department contracts', () => {
  it('registers the department module with on/off permissions', () => {
    expect(modules.map((m) => m.name)).toContain('department');
    const perms = allPermissions().filter((p) => p.module === 'department');
    expect(perms.map((p) => [p.key, p.scopes])).toEqual([
      ['department.read', []],
      ['department.manage', []],
      ['department.import', []],
    ]);
  });

  it('trims the name and rejects a blank one', () => {
    expect(departmentInputSchema.parse({ name: '  Sales ' })).toEqual({ name: 'Sales' });
    expect(departmentInputSchema.safeParse({ name: '   ' }).success).toBe(false);
  });

  it('caps the name length', () => {
    expect(departmentInputSchema.safeParse({ name: 'x'.repeat(101) }).success).toBe(false);
  });
});
