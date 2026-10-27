import { describe, expect, it } from 'vitest';
import { defineModule } from './module.js';
import { allPermissions, resolveModuleOrder } from './registry.js';

const mod = (name: string, deps: string[] = [], permissions: Record<string, string> = {}) =>
  defineModule({ name, deps, permissions, nav: [], events: [] });

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

  it('throws on a duplicate key across modules', () => {
    expect(() =>
      allPermissions([mod('a', [], { 'p.x': 'X' }), mod('b', [], { 'p.x': 'X' })]),
    ).toThrow("duplicate permission 'p.x'");
  });
});
