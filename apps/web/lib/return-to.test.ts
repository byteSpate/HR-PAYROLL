import { describe, expect, it } from 'vitest';
import { loginPathFor, sanitizeReturnTo } from './return-to';

describe('sanitizeReturnTo', () => {
  it('keeps same-site paths with query and hash', () => {
    expect(sanitizeReturnTo('/settings/users?q=a#top')).toBe('/settings/users?q=a#top');
  });

  it.each([
    null,
    '',
    '//evil.com',
    '/\\evil.com',
    'https://evil.com',
    'javascript:alert(1)',
    'settings',
    '/%2F%2Fevil.com',
    '/%5Cevil.com',
    '/login',
    '/login?returnTo=/x',
  ])('drops %s', (raw) => {
    expect(sanitizeReturnTo(raw)).toBeNull();
  });
});

describe('loginPathFor', () => {
  it('encodes the page asked for', () => {
    expect(loginPathFor('/settings/users', '?a=1')).toBe('/login?returnTo=%2Fsettings%2Fusers%3Fa%3D1');
  });

  it('omits returnTo for the root', () => {
    expect(loginPathFor('/')).toBe('/login');
  });
});
