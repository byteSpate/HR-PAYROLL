import { describe, expect, it } from 'vitest';
import { can, covers, scopeFor, type AccessContext } from './access.js';

const standard = (...grants: string[]): AccessContext => ({ accessLevel: 'STANDARD', grants });

describe('covers', () => {
  it('orders own < team < department < all', () => {
    expect(covers('all', 'department')).toBe(true);
    expect(covers('department', 'department')).toBe(true);
    expect(covers('team', 'department')).toBe(false);
    expect(covers('own', 'team')).toBe(false);
  });
});

describe('can and scopeFor', () => {
  it('a wider scoped grant covers narrower requirements only', () => {
    const ctx = standard('leave.approve:department');
    expect(can(ctx, 'leave.approve:team')).toBe(true);
    expect(can(ctx, 'leave.approve:department')).toBe(true);
    expect(can(ctx, 'leave.approve:all')).toBe(false);
    expect(scopeFor(ctx, 'leave.approve')).toBe('department');
  });

  it('a bare key requirement is met by any scope of that key', () => {
    expect(can(standard('leave.approve:own'), 'leave.approve')).toBe(true);
    expect(can(standard('leave.view:all'), 'leave.approve')).toBe(false);
  });

  it('an on/off grant satisfies the bare key', () => {
    const ctx = standard('user.manage');
    expect(can(ctx, 'user.manage')).toBe(true);
    expect(can(ctx, 'role.manage')).toBe(false);
    expect(scopeFor(ctx, 'user.manage')).toBeNull();
  });

  it('an on/off grant does not satisfy a scoped requirement', () => {
    expect(can(standard('user.manage'), 'user.manage:all')).toBe(false);
  });

  it('does not match a key that merely shares a prefix', () => {
    expect(can(standard('leave.approve:all'), 'leave.approve.extra')).toBe(false);
    expect(can(standard('leave.approve.extra:all'), 'leave.approve:own')).toBe(false);
  });

  it('scopeFor returns the widest held scope', () => {
    expect(scopeFor(standard('e.read:own', 'e.read:all', 'e.read:team'), 'e.read')).toBe('all');
  });

  it('ADMIN and SUPER_ADMIN pass any key with all scope', () => {
    for (const accessLevel of ['ADMIN', 'SUPER_ADMIN'] as const) {
      const ctx: AccessContext = { accessLevel, grants: [] };
      expect(can(ctx, 'x.y:all')).toBe(true);
      expect(can(ctx, 'anything')).toBe(true);
      expect(scopeFor(ctx, 'x.y')).toBe('all');
    }
  });

  it('a STANDARD user with no grants can do nothing', () => {
    expect(can(standard(), 'x.y')).toBe(false);
    expect(scopeFor(standard(), 'x.y')).toBeNull();
  });
});
