import { describe, expect, it } from 'vitest';
import { describeChange } from './activity-format';

describe('describeChange', () => {
  it('lists each changed field as "field: old -> new"', () => {
    expect(describeChange({ name: 'Ops', isActive: true }, { name: 'Operations', isActive: false })).toEqual([
      'name: Ops -> Operations',
      'isActive: true -> false',
    ]);
  });

  it('shows created and removed values with a dash for the missing side', () => {
    expect(describeChange(null, { name: 'HR' })).toEqual(['name: - -> HR']);
    expect(describeChange({ name: 'HR' }, null)).toEqual(['name: HR -> -']);
  });

  it('returns nothing when neither side has fields', () => {
    expect(describeChange(null, null)).toEqual([]);
  });

  it('prints arrays and objects as compact JSON', () => {
    expect(describeChange({ grants: ['a'] }, { grants: ['a', 'b'] })).toEqual(['grants: ["a"] -> ["a","b"]']);
  });
});
