import type { Request } from 'express';
import { refreshLifetimeMs } from '@erp/auth';
import { env } from '../../env.js';

export const REFRESH_COOKIE_NAME = 'refreshToken';

export function refreshCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  };
}

// maxAge matches the token's own lifetime; without it the browser drops the cookie
// on close. Clearing uses the plain options, since a cookie is removed by name/path/flags.
export function refreshCookieSetOptions() {
  return { ...refreshCookieOptions(), maxAge: refreshLifetimeMs(env.JWT_REFRESH_EXPIRY) };
}

export interface SessionContext {
  userAgent: string | null;
  ipAddress: string | null;
}

// req.ip is the real client only because app.ts sets `trust proxy`. The user agent is
// truncated so an unvalidated header cannot write an unbounded string to the database.
export function sessionContext(req: Request): SessionContext {
  const userAgent = req.headers['user-agent'];
  return {
    userAgent: typeof userAgent === 'string' ? userAgent.slice(0, 400) : null,
    ipAddress: req.ip ?? null,
  };
}
