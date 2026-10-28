import type { NextFunction, Request, Response } from 'express';
import { verifyAccessToken, type AccessTokenPayload } from '@erp/auth';
import { AppError } from '@erp/utils';
import { env } from '../env.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
    }
  }
}

const ACCESS_LEVELS = new Set(['SUPER_ADMIN', 'ADMIN', 'STANDARD']);

// verifyAccessToken only casts the decoded payload, so a validly signed token
// with the wrong shape must be rejected here.
function isValidPayload(p: unknown): p is AccessTokenPayload {
  if (typeof p !== 'object' || p === null) return false;
  const { sub, accessLevel, grants } = p as Record<string, unknown>;
  return (
    typeof sub === 'string' &&
    typeof accessLevel === 'string' &&
    ACCESS_LEVELS.has(accessLevel) &&
    Array.isArray(grants) &&
    grants.every((g) => typeof g === 'string')
  );
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(new AppError(401, 'Missing or malformed Authorization header'));
  }
  try {
    const payload: unknown = verifyAccessToken(header.slice('Bearer '.length), env.JWT_ACCESS_SECRET);
    if (!isValidPayload(payload)) return next(new AppError(401, 'Invalid or expired access token'));
    req.user = payload;
    return next();
  } catch {
    return next(new AppError(401, 'Invalid or expired access token'));
  }
}
