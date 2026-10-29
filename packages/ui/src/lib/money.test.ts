import { describe, expect, it } from 'vitest';
import { formatMoney, formatMonth, formatRate, isNegativeMoney } from './money';

describe('formatMoney', () => {
  it('always shows the currency, with two decimals', () => {
    expect(formatMoney('1234.5', 'USD')).toBe('$1,234.50');
    expect(formatMoney('72258.06', 'BDT')).toContain('72,258.06');
    expect(formatMoney('72258.06', 'BDT')).toMatch(/BDT|৳/);
  });
});

describe('formatRate', () => {
  it('keeps six decimals and no currency symbol, since a rate is a ratio', () => {
    expect(formatRate('122.5')).toBe('122.500000');
  });
});

describe('formatMonth', () => {
  it('names the month of a 1-based month number in UTC', () => {
    expect(formatMonth(7, 2026)).toBe('July 2026');
    expect(formatMonth(1, 2027)).toBe('January 2027');
  });
});

describe('isNegativeMoney', () => {
  it('flags a leading minus so the screen can mark it', () => {
    expect(isNegativeMoney('-12.00')).toBe(true);
    expect(isNegativeMoney('  -0.01')).toBe(true);
    expect(isNegativeMoney('12.00')).toBe(false);
  });
});
