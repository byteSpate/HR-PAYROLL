import { hashToken } from '@erp/auth';
import { prisma } from '@erp/db';
import { AppError } from '@erp/utils';

export interface SessionView {
  sessionId: string;
  device: string;
  ipAddress: string | null;
  startedAt: string;
  lastUsedAt: string;
  current: boolean;
}

// Order matters: Edge and Opera include "Chrome" in their user agents, and every
// iOS browser includes "Safari", so the more specific token is tested first.
const BROWSERS: [RegExp, string][] = [
  [/\bEdgA?\//, 'Edge'],
  [/\bOPR\/|\bOpera\//, 'Opera'],
  [/\bSamsungBrowser\//, 'Samsung Internet'],
  [/\bFirefox\/|\bFxiOS\//, 'Firefox'],
  [/\bCriOS\//, 'Chrome'],
  [/\bChrome\//, 'Chrome'],
  [/\bSafari\//, 'Safari'],
];
const PLATFORMS: [RegExp, string][] = [
  // Before Mac: an iPad reports "like Mac OS X".
  [/\biPhone\b|\biPad\b|\biPod\b/, 'iOS'],
  [/\bAndroid\b/, 'Android'],
  [/\bWindows\b/, 'Windows'],
  [/\bMac OS X\b|\bMacintosh\b/, 'macOS'],
  [/\bCrOS\b/, 'ChromeOS'],
  [/\bLinux\b/, 'Linux'],
];

export function describeDevice(userAgent: string | null): string {
  if (!userAgent) return 'Unknown device';
  const browser = BROWSERS.find(([p]) => p.test(userAgent))?.[1];
  const platform = PLATFORMS.find(([p]) => p.test(userAgent))?.[1];
  if (browser && platform) return `${browser} on ${platform}`;
  return browser ?? platform ?? 'Unknown device';
}

export async function listSessions(userId: string, currentRawToken: string | undefined): Promise<SessionView[]> {
  const currentHash = currentRawToken ? hashToken(currentRawToken) : null;
  const rows = await prisma.refreshToken.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { lastUsedAt: 'desc' },
  });
  return rows.map((row) => ({
    sessionId: row.sessionId,
    device: describeDevice(row.userAgent),
    ipAddress: row.ipAddress,
    startedAt: row.startedAt.toISOString(),
    lastUsedAt: row.lastUsedAt.toISOString(),
    current: currentHash !== null && row.tokenHash === currentHash,
  }));
}

// userId is in the where clause, not checked afterwards: another user's session id
// matches nothing and 404s, the same answer as one that never existed.
export async function revokeSession(
  userId: string,
  sessionId: string,
  currentRawToken: string | undefined,
): Promise<void> {
  const rows = await prisma.refreshToken.findMany({
    where: { userId, sessionId, revokedAt: null },
    select: { tokenHash: true },
  });
  if (rows.length === 0) throw new AppError(404, 'Session not found');
  if (currentRawToken) {
    const currentHash = hashToken(currentRawToken);
    if (rows.some((r) => r.tokenHash === currentHash)) {
      throw new AppError(409, 'This is the session you are using. Sign out instead.');
    }
  }
  await prisma.refreshToken.updateMany({ where: { userId, sessionId, revokedAt: null }, data: { revokedAt: new Date() } });
}
