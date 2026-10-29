import { describe, expect, it } from 'vitest';
import { describeUsage } from './describe-usage.js';

describe('describeUsage', () => {
  it('is null when nothing is in use, so a caller can pass every relation unconditionally', () => {
    expect(
      describeUsage([
        { noun: 'asset', count: 0 },
        { noun: 'request', count: 0 },
      ]),
    ).toBeNull();
  });

  it('names one thing in the singular or plural', () => {
    expect(describeUsage([{ noun: 'asset', count: 1 }])).toBe('1 asset');
    expect(describeUsage([{ noun: 'asset', count: 3 }])).toBe('3 assets');
  });

  it('joins several with commas and an and, dropping the empty ones', () => {
    expect(
      describeUsage([
        { noun: 'asset', count: 4 },
        { noun: 'request', count: 0 },
        { noun: 'repair', count: 2 },
      ]),
    ).toBe('4 assets and 2 repairs');
    expect(
      describeUsage([
        { noun: 'a', count: 1 },
        { noun: 'b', count: 2 },
        { noun: 'c', count: 3 },
      ]),
    ).toBe('1 a, 2 bs and 3 cs');
  });
});
