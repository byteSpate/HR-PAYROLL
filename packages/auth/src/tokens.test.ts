import { describe, expect, it } from 'vitest';
import {
  generateOpaqueToken,
  hashToken,
  refreshLifetimeMs,
  signAccessToken,
  verifyAccessToken,
} from './tokens.js';

const SECRET = 'test-secret-that-is-long-enough';

describe('access tokens', () => {
  it('round-trips the subject, level and grants', () => {
    const token = signAccessToken({ sub: 'u1', accessLevel: 'STANDARD', grants: ['a.b:all'] }, SECRET, '15m');
    expect(verifyAccessToken(token, SECRET)).toMatchObject({ sub: 'u1', accessLevel: 'STANDARD', grants: ['a.b:all'] });
  });

  it('throws when the secret does not match', () => {
    const token = signAccessToken({ sub: 'u1', accessLevel: 'ADMIN', grants: [] }, SECRET, '15m');
    expect(() => verifyAccessToken(token, 'another-secret-entirely')).toThrow();
  });

  it('throws on an expired token', () => {
    const token = signAccessToken({ sub: 'u1', accessLevel: 'ADMIN', grants: [] }, SECRET, '-1s');
    expect(() => verifyAccessToken(token, SECRET)).toThrow();
  });
});

describe('refreshLifetimeMs', () => {
  it('converts seconds, minutes, hours and days', () => {
    expect(refreshLifetimeMs('7d')).toBe(604_800_000);
    expect(refreshLifetimeMs('30m')).toBe(1_800_000);
    expect(refreshLifetimeMs('12h')).toBe(43_200_000);
    expect(refreshLifetimeMs('45s')).toBe(45_000);
  });

  it('throws on a zero lifetime', () => {
    expect(() => refreshLifetimeMs('0d')).toThrow();
  });

  it('throws on an unrecognised setting', () => {
    expect(() => refreshLifetimeMs('x')).toThrow();
  });
});

describe('opaque tokens', () => {
  it('generates distinct base64url strings of 32 random bytes', () => {
    const a = generateOpaqueToken();
    const b = generateOpaqueToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('hashes to a stable sha256 hex digest', () => {
    expect(hashToken('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});
