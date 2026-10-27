import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { proxy } from './proxy';

const req = (path: string, cookie?: string) =>
  new NextRequest(`http://localhost:3000${path}`, { headers: cookie ? { cookie } : {} });

describe('proxy', () => {
  it('sends an unauthenticated visitor to /login with returnTo', () => {
    const res = proxy(req('/settings/users'));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get('location')!).pathname + new URL(res.headers.get('location')!).search).toBe(
      '/login?returnTo=%2Fsettings%2Fusers',
    );
  });

  it('keeps the query string in returnTo', () => {
    const res = proxy(req('/settings/users?q=ann'));
    expect(res.headers.get('location')).toContain('returnTo=%2Fsettings%2Fusers%3Fq%3Dann');
  });

  it('lets /login through', () => {
    const res = proxy(req('/login'));
    expect(res.headers.get('location')).toBeNull();
    expect(res.headers.get('x-middleware-next')).toBe('1');
  });

  it('lets a visitor with a refresh cookie through', () => {
    const res = proxy(req('/settings/users', 'refreshToken=abc'));
    expect(res.headers.get('x-middleware-next')).toBe('1');
  });

  it('drops an off-site returnTo', () => {
    const res = proxy(req('/login?returnTo=https://evil.com'));
    const location = new URL(res.headers.get('location')!);
    expect(location.pathname).toBe('/login');
    expect(location.search).toBe('');
  });

  it('keeps a same-site returnTo', () => {
    const res = proxy(req('/login?returnTo=%2Fsettings%2Froles'));
    expect(res.headers.get('x-middleware-next')).toBe('1');
  });
});
