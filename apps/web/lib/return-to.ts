// The remembered page travels in the address bar, so it is untrusted: only a path on this site may be followed,
// otherwise a crafted /login?returnTo=... link becomes an open redirect after sign-in.

const MAX_LENGTH = 2000;
const UNSAFE_CHARS = /[\u0000-\u001f\u007f\\]/;
const pathOf = (value: string) => value.split(/[?#]/)[0] ?? '';

export function sanitizeReturnTo(raw: string | null | undefined): string | null {
  if (!raw || raw.length > MAX_LENGTH) return null;
  if (!raw.startsWith('/') || raw.startsWith('//')) return null;
  if (UNSAFE_CHARS.test(raw)) return null;

  // One round of decoding: `/%2F%2Fevil.com` means `//evil.com` to anything that decodes before following.
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  if (decoded.startsWith('//') || UNSAFE_CHARS.test(decoded)) return null;

  // Returning to the sign-in page would loop.
  const path = pathOf(raw);
  if (path === '/login' || path.startsWith('/login/')) return null;
  return raw;
}

export function loginPathFor(pathname: string, search = ''): string {
  const target = sanitizeReturnTo(`${pathname}${search}`);
  return target && target !== '/' ? `/login?returnTo=${encodeURIComponent(target)}` : '/login';
}
