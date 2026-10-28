import type { PublicUser } from '@erp/contracts/core';
import { ApiError } from '@erp/utils';

// Re-exported so existing imports from this module keep working.
export { ApiError };

export interface DownloadedFile {
  blob: Blob;
  fileName: string;
}

export interface SessionPayload {
  accessToken: string;
  user: PublicUser;
}

interface ApiClientOptions {
  baseUrl: string;
  onUnauthenticated: () => void;
  fetchImpl?: typeof fetch;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  /** Auth endpoints must not trigger a refresh: a 401 from login means wrong credentials. */
  skipRefresh?: boolean;
}

export type RefreshResult = SessionPayload | 'signed-out' | 'unreachable';

// The refresh token is single-use (every renewal rotates it), so concurrent renewals must share
// one call, within a tab by the in-flight promise and across tabs by a browser lock.
function withBrowserLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  return locks ? (locks.request('erp-session-renewal', () => fn()) as Promise<T>) : fn();
}

async function readError(res: Response): Promise<ApiError> {
  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    // Non-JSON error body: fall through to the generic message.
  }
  const message = typeof body['error'] === 'string' ? body['error'] : `Request failed (${res.status})`;
  return new ApiError(res.status, message, body);
}

const fileNameOf = (res: Response, fallback: string) =>
  /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? fallback;

export function createApiClient({ baseUrl, onUnauthenticated, fetchImpl }: ApiClientOptions) {
  const doFetch: typeof fetch = (...args) => (fetchImpl ?? fetch)(...args);
  let accessToken: string | null = null;
  let inFlight: Promise<RefreshResult> | null = null;

  async function callRefresh(): Promise<RefreshResult> {
    try {
      const res = await doFetch(`${baseUrl}/auth/refresh`, { method: 'POST', credentials: 'include' });
      if (res.ok) return (await res.json()) as SessionPayload;
      return res.status === 401 || res.status === 403 ? 'signed-out' : 'unreachable';
    } catch {
      return 'unreachable';
    }
  }

  function refresh(): Promise<RefreshResult> {
    inFlight ??= withBrowserLock(callRefresh)
      .then((result) => {
        if (typeof result === 'object') accessToken = result.accessToken;
        return result;
      })
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  }

  async function send(path: string, { method = 'GET', body }: RequestOptions): Promise<Response> {
    const headers = new Headers();
    // FormData carries its own multipart boundary, which only the browser can set.
    const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
    if (body !== undefined && !isForm) headers.set('content-type', 'application/json');
    if (accessToken) headers.set('authorization', `Bearer ${accessToken}`);
    return doFetch(`${baseUrl}${path}`, {
      method,
      headers,
      credentials: 'include',
      body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
    });
  }

  async function sendWithRefresh(path: string, options: RequestOptions): Promise<Response> {
    let res = await send(path, options);

    if (res.status === 401 && !options.skipRefresh) {
      const renewed = await refresh();
      if (typeof renewed === 'object') {
        res = await send(path, options);
      } else if (renewed === 'signed-out') {
        onUnauthenticated();
      }
    }

    if (!res.ok) throw await readError(res);
    return res;
  }

  async function request<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
    const res = await sendWithRefresh(path, options);
    return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
  }

  /** For exports and templates: the file plus the name the server chose for it. */
  async function download(path: string): Promise<DownloadedFile> {
    const res = await sendWithRefresh(path, {});
    return { blob: await res.blob(), fileName: fileNameOf(res, 'download') };
  }

  return {
    request,
    download,
    refresh,
    setAccessToken(token: string | null) {
      accessToken = token;
    },
  };
}

// One client per page load; the session provider registers what to do on sign-out.
let unauthenticatedListener: (() => void) | null = null;
export function setUnauthenticatedListener(listener: (() => void) | null) {
  unauthenticatedListener = listener;
}

// A production build silently talking to localhost would fail confusingly, so require the URL there.
function resolveBaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_API_URL;
  if (url) return url;
  if (process.env.NODE_ENV === 'production') throw new Error('NEXT_PUBLIC_API_URL is required in production');
  return 'http://localhost:4000/api';
}

export const api = createApiClient({
  baseUrl: resolveBaseUrl(),
  onUnauthenticated: () => unauthenticatedListener?.(),
});
