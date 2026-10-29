import { describe, expect, it } from 'vitest';
import { createClaimBody, updateClaimBody } from './schemas.js';
import { exchangeRateBody } from '../exchange/schemas.js';

const claim = { name: 'Taxi', categoryId: '0f8fad5b-d9cb-469f-a165-70867728950e', expenseDate: '2026-10-01' };

describe('claim amounts', () => {
  it('keeps a decimal string exactly as written, with up to two decimals', () => {
    expect(createClaimBody.parse({ ...claim, amount: '80' }).amount).toBe('80');
    expect(createClaimBody.parse({ ...claim, amount: '33.33' }).amount).toBe('33.33');
    expect(createClaimBody.parse({ ...claim, amount: ' 0.5 ' }).amount).toBe('0.5');
  });

  it('takes a JSON number too, through its shortest decimal form', () => {
    expect(createClaimBody.parse({ ...claim, amount: 33.33 }).amount).toBe('33.33');
  });

  it('refuses what the database would round away, so 0.001 is never stored as 0.00', () => {
    for (const amount of ['0.001', '12.345', '0.005', 0.001]) {
      expect(createClaimBody.safeParse({ ...claim, amount }).success, String(amount)).toBe(false);
    }
  });

  it('refuses zero, negatives, exponents, blanks and amounts too large for the column', () => {
    for (const amount of ['0', '0.00', '-1', '1e3', '', 'abc', '1,000', '1234567890123', 1e21, Number.NaN]) {
      expect(createClaimBody.safeParse({ ...claim, amount }).success, String(amount)).toBe(false);
    }
  });

  it('applies the same rule when an amount is amended', () => {
    expect(updateClaimBody.parse({ amount: '12.5' }).amount).toBe('12.5');
    expect(updateClaimBody.safeParse({ amount: '12.505' }).success).toBe(false);
  });
});

describe('exchange rates', () => {
  const rate = { base: 'USD', quote: 'BDT', effectiveFrom: '2026-10-01' };

  it('keeps up to six decimals as written', () => {
    expect(exchangeRateBody.parse({ ...rate, rate: '122.123456' }).rate).toBe('122.123456');
    expect(exchangeRateBody.parse({ ...rate, rate: 122.5 }).rate).toBe('122.5');
  });

  it('refuses a rate with more precision than it stores, and a zero rate', () => {
    for (const value of ['122.1234567', '0', '0.0000001', '-5']) {
      expect(exchangeRateBody.safeParse({ ...rate, rate: value }).success, value).toBe(false);
    }
  });
});
