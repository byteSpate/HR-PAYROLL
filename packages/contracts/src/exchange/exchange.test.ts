import { describe, expect, it } from 'vitest';
import { allPermissions, modules } from '../registry.js';
import { exchangeRateBody } from './schemas.js';

describe('exchange contracts', () => {
  it('registers the exchange module with one on/off permission', () => {
    expect(modules.map((m) => m.name)).toContain('exchange');
    expect(
      allPermissions()
        .filter((p) => p.module === 'exchange')
        .map((p) => [p.key, p.scopes]),
    ).toEqual([['exchange.config', []]]);
  });

  it('accepts a rate between two different currencies', () => {
    expect(
      exchangeRateBody.parse({
        base: 'USD',
        quote: 'BDT',
        rate: '122.5',
        effectiveFrom: '2026-07-01',
      }),
    ).toMatchObject({ rate: '122.5' });
  });

  it('refuses the same currency on both sides, a non-positive rate and a malformed date', () => {
    expect(
      exchangeRateBody.safeParse({
        base: 'USD',
        quote: 'USD',
        rate: 1,
        effectiveFrom: '2026-07-01',
      }).success,
    ).toBe(false);
    expect(
      exchangeRateBody.safeParse({
        base: 'USD',
        quote: 'BDT',
        rate: 0,
        effectiveFrom: '2026-07-01',
      }).success,
    ).toBe(false);
    expect(
      exchangeRateBody.safeParse({
        base: 'USD',
        quote: 'BDT',
        rate: 1,
        effectiveFrom: '01/07/2026',
      }).success,
    ).toBe(false);
  });
});
