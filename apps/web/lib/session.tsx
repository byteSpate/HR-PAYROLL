'use client';

import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { PublicUser } from '@erp/contracts/core';
import { api, setUnauthenticatedListener, type SessionPayload } from './api-client';

type Status = 'loading' | 'authenticated' | 'unauthenticated';

interface SessionValue {
  user: PublicUser | null;
  status: Status;
  /**
   * For the screens copied from HR-MNG-V1, which read the token from the session and thread it
   * through every call. The shared client already attaches it to each request, so the copied calls
   * ignore the value; it exists so those components run unchanged.
   */
  accessToken: string;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  /** Replaces the cached user, e.g. after the forced password change clears mustChangePassword. */
  setUser(user: PublicUser): void;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [status, setStatus] = useState<Status>('loading');

  const clear = useCallback(() => {
    api.setAccessToken(null);
    setUser(null);
    setStatus('unauthenticated');
    // The next person to sign in must not see this person's cached lists.
    queryClient.clear();
  }, [queryClient]);

  useEffect(() => {
    setUnauthenticatedListener(clear);
    let cancelled = false;
    // Concurrent callers (React's dev double-mount) share one refresh, so the single-use cookie is spent once.
    void api.refresh().then((result) => {
      if (cancelled) return;
      if (typeof result === 'object') {
        setUser(result.user);
        setStatus('authenticated');
      } else {
        setStatus('unauthenticated');
      }
    });
    return () => {
      cancelled = true;
      setUnauthenticatedListener(null);
    };
  }, [clear]);

  const signIn = useCallback(async (email: string, password: string) => {
    const session = await api.request<SessionPayload>('/auth/login', {
      method: 'POST',
      body: { email, password },
      skipRefresh: true,
    });
    api.setAccessToken(session.accessToken);
    setUser(session.user);
    setStatus('authenticated');
  }, []);

  const signOut = useCallback(async () => {
    // Clear locally even if the server is unreachable: the person asked to leave.
    await api.request('/auth/logout', { method: 'POST', skipRefresh: true }).catch(() => undefined);
    clear();
  }, [clear]);

  const value = useMemo(
    // `user` and `status` change whenever the token does (sign-in, refresh, sign-out), so it is read with them.
    () => ({ user, status, accessToken: api.getAccessToken() ?? '', signIn, signOut, setUser }),
    [user, status, signIn, signOut],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within a SessionProvider');
  return ctx;
}
