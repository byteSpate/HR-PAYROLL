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

describe('envSchema Cloudinary settings', () => {
  it('accepts none of them (file storage off)', () => {
    expect(envSchema.safeParse(base).success).toBe(true);
  });

  it('treats blank values from a copied .env.example as unset', () => {
    const r = envSchema.safeParse({ ...base, CLOUDINARY_CLOUD_NAME: '', CLOUDINARY_API_KEY: '', CLOUDINARY_API_SECRET: '' });
    expect(r.success).toBe(true);
    expect(r.data?.CLOUDINARY_CLOUD_NAME).toBeUndefined();
  });

  it('accepts all three', () => {
    const r = envSchema.safeParse({
      ...base,
      CLOUDINARY_CLOUD_NAME: 'c',
      CLOUDINARY_API_KEY: 'k',
      CLOUDINARY_API_SECRET: 's',
    });
    expect(r.success).toBe(true);
  });

  it('rejects a partial set, naming the missing setting', () => {
    const r = envSchema.safeParse({ ...base, CLOUDINARY_CLOUD_NAME: 'c', CLOUDINARY_API_KEY: 'k' });
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain('CLOUDINARY_API_SECRET');
  });
});
