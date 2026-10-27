import { describe, expect, it } from 'vitest';
import { effectivePermissions, hasPermission } from './permissions.js';

describe('effectivePermissions', () => {
  it('returns the sorted union of role permissions without duplicates', () => {
    const roles = [
      { permissions: [{ permissionKey: 'b.x' }, { permissionKey: 'a.y' }] },
      { permissions: [{ permissionKey: 'a.y' }] },
    ];
    expect(effectivePermissions(roles)).toEqual(['a.y', 'b.x']);
  });

  it('returns an empty list for no roles', () => {
    expect(effectivePermissions([])).toEqual([]);
  });
});

describe('hasPermission', () => {
  it('is true only for a granted key', () => {
    expect(hasPermission(['a.y'], 'a.y')).toBe(true);
    expect(hasPermission(['a.y'], 'a.z')).toBe(false);
  });
});
