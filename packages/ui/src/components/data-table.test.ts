import { describe, expect, it } from 'vitest';
import { sortRows } from './data-table';

const rows = [{ name: 'beta', n: 2 }, { name: 'Alpha', n: 10 }, { name: 'gamma', n: 1 }];

describe('sortRows', () => {
  it('sorts text case-insensitively and numbers numerically, both ways', () => {
    expect(sortRows(rows, (r) => r.name, 'asc').map((r) => r.name)).toEqual(['Alpha', 'beta', 'gamma']);
    expect(sortRows(rows, (r) => r.n, 'desc').map((r) => r.n)).toEqual([10, 2, 1]);
  });

  it('puts empty values last and does not mutate the input', () => {
    const withEmpty = [{ v: null }, { v: 'b' }, { v: 'a' }];
    expect(sortRows(withEmpty, (r) => r.v, 'asc').map((r) => r.v)).toEqual(['a', 'b', null]);
    expect(withEmpty[0]!.v).toBeNull();
  });
});
