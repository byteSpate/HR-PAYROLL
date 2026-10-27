import { describe, expect, it } from 'vitest';
import { envSchema } from './env.js';

const base = {
  DATABASE_URL: 'postgresql://x',
  JWT_ACCESS_SECRET: 'a'.repeat(16),
  JWT_REFRESH_SECRET: 'b'.repeat(16),
};

describe('envSchema token lifetimes', () => {
  it('accepts valid lifetimes', () => {
    expect(envSchema.safeParse({ ...base, JWT_ACCESS_EXPIRY: '30m', JWT_REFRESH_EXPIRY: '7d' }).success).toBe(true);
  });

  it.each([
    ['JWT_REFRESH_EXPIRY', 'soon'],
    ['JWT_REFRESH_EXPIRY', '0d'],
    ['JWT_ACCESS_EXPIRY', '15'],
  ])('rejects %s=%s', (key, value) => {
    expect(envSchema.safeParse({ ...base, [key]: value }).success).toBe(false);
  });
});
