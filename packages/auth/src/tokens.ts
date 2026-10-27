import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';

export interface AccessTokenPayload {
  sub: string;
  permissions: string[];
}

// Pinned to HS256 so verification never accepts a token signed with another
// algorithm, even if a caller later passes a different key type.
const ALGORITHM = 'HS256';

export function signAccessToken(payload: AccessTokenPayload, secret: string, expiresIn: string): string {
  return jwt.sign(payload, secret, { algorithm: ALGORITHM, expiresIn: expiresIn as jwt.SignOptions['expiresIn'] });
}

export function verifyAccessToken(token: string, secret: string): AccessTokenPayload {
  return jwt.verify(token, secret, { algorithms: [ALGORITHM] }) as AccessTokenPayload;
}

export function generateOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

// Refresh tokens are stored hashed, so a database leak does not expose live tokens.
export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

const UNIT_MS = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 } as const;

/**
 * Lifetime in milliseconds for a setting such as "7d", "12h" or "30m".
 *
 * Throws instead of falling back to a default: a silently wrong lifetime would
 * desynchronise the database expiry from the browser cookie that carries the
 * same token, so an unreadable setting must fail at startup.
 */
export function refreshLifetimeMs(setting: string): number {
  const match = /^(\d+)([smhd])$/.exec(setting);
  if (!match) {
    throw new Error(`Invalid lifetime setting '${setting}': expected a number followed by s, m, h or d`);
  }
  return Number(match[1]) * UNIT_MS[match[2] as keyof typeof UNIT_MS];
}
