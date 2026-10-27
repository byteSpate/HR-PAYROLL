import { describe, expect, it } from 'vitest';
import { defineModule, type ModuleManifest, type Scope } from './module.js';
import { allPermissions, resolveModuleOrder } from './registry.js';

const mod = (name: string, deps: string[] = [], permissions: Record<string, { label: string; scopes?: readonly Scope[] }> = {}) =>
  defineModule({ name, deps, permissions: permissions as ModuleManifest['permissions'], nav: [], events: [] });

describe('resolveModuleOrder', () => {
  it('puts dependencies first', () => {
    const order = resolveModuleOrder([mod('b', ['a']), mod('a')]);
    expect(order.map((m) => m.name)).toEqual(['a', 'b']);
  });

  it('throws on an unregistered dependency, naming the dependant', () => {
    expect(() => resolveModuleOrder([mod('b', ['x'])])).toThrow(/unknown dependency 'x'/);
    expect(() => resolveModuleOrder([mod('b', ['x'])])).toThrow(/'b'/);
  });

  it('throws on a cycle and shows the path', () => {
    expect(() => resolveModuleOrder([mod('a', ['b']), mod('b', ['a'])])).toThrow(/cycle.*a -> b -> a/);
  });
});

describe('allPermissions', () => {
  it('lists registered permissions with their module', () => {
    expect(allPermissions()).toContainEqual(
      expect.objectContaining({ key: 'role.manage', module: 'core' }),
    );
  });

  it('carries declared scopes and defaults to on/off', () => {
    const perms = allPermissions([
      mod('a', [], { 'p.x': { label: 'X', scopes: ['own', 'all'] }, 'p.y': { label: 'Y' } }),
    ]);
    expect(perms.find((p) => p.key === 'p.x')?.scopes).toEqual(['own', 'all']);
    expect(perms.find((p) => p.key === 'p.y')?.scopes).toEqual([]);
  });

  it('throws on a duplicate key across modules', () => {
    expect(() =>
      allPermissions([mod('a', [], { 'p.x': { label: 'X' } }), mod('b', [], { 'p.x': { label: 'X' } })]),
    ).toThrow("duplicate permission 'p.x'");
  });
});
