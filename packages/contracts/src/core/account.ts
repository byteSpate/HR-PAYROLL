// What the signed-in person's own account page shows. Ported from HR-MNG-V1's MyProfileResponse
// account block: the account is separate from the employee record, and someone with no employee
// record (an admin) keeps their name and photo here.
export interface AccountView {
  email: string;
  accessLevel: 'SUPER_ADMIN' | 'ADMIN' | 'STANDARD';
  role: { id: string; name: string } | null;
  mustChangePassword: boolean;
  /** When the account was opened, not when the person joined. */
  createdAt: string;
  /** Live sign-ins. There is no "signed in since": tokens rotate, so only a count and a last use are true. */
  sessions: { count: number; lastActiveAt: string | null };
  /** Set only by accounts with no employee record; staff take their name and photo from HR. */
  displayName: string | null;
  avatarUrl: string | null;
}

/** One live sign-in. `sessionId` survives token rotation; the raw token never leaves the cookie. */
export interface SessionView {
  sessionId: string;
  /** "Chrome on Windows", or "Unknown device". Derived server-side from the user agent. */
  device: string;
  ipAddress: string | null;
  startedAt: string;
  lastUsedAt: string;
  /** The session reading this list. The server refuses to revoke it. */
  current: boolean;
}
