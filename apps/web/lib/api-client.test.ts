import { describe, expect, it, vi } from 'vitest';
import { createApiClient } from './api-client';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const user = { id: 'u1' } as never;

// A server that accepts only the 'fresh' token and hands it out on refresh.
function fakeServer() {
  const calls: { url: string; auth: string | null }[] = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const auth = new Headers(init?.headers).get('authorization');
    calls.push({ url, auth });
    if (url.endsWith('/auth/refresh')) {
      await new Promise((r) => setTimeout(r, 10));
      return json(200, { accessToken: 'fresh', user });
    }
    return auth === 'Bearer fresh' ? json(200, { ok: url }) : json(401, { error: 'expired' });
  });
  return { calls, fetchImpl: fetchImpl as unknown as typeof fetch };
}

describe('createApiClient', () => {
  it('refreshes once for two concurrent 401s, then retries each request once', async () => {
    const { calls, fetchImpl } = fakeServer();
    const client = createApiClient({ baseUrl: 'http://api/api', onUnauthenticated: vi.fn(), fetchImpl });
    client.setAccessToken('stale');

    const [a, b] = await Promise.all([client.request('/users'), client.request('/roles')]);

    expect(a).toEqual({ ok: 'http://api/api/users' });
    expect(b).toEqual({ ok: 'http://api/api/roles' });
    expect(calls.filter((c) => c.url.endsWith('/auth/refresh'))).toHaveLength(1);
    expect(calls.filter((c) => c.url.endsWith('/users'))).toHaveLength(2);
    expect(calls.filter((c) => c.url.endsWith('/roles'))).toHaveLength(2);
  });

  it('calls onUnauthenticated and throws when the refresh is refused', async () => {
    const onUnauthenticated = vi.fn();
    const fetchImpl = vi.fn(async () => json(401, { error: 'nope' })) as unknown as typeof fetch;
    const client = createApiClient({ baseUrl: 'http://api/api', onUnauthenticated, fetchImpl });
    client.setAccessToken('stale');

    await expect(client.request('/users')).rejects.toMatchObject({ status: 401 });
    expect(onUnauthenticated).toHaveBeenCalledTimes(1);
  });

  it('does not retry more than once when the retry also gets 401', async () => {
    let users = 0;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/auth/refresh')) return json(200, { accessToken: 'fresh', user });
      users++;
      return json(401, { error: 'still no' });
    }) as unknown as typeof fetch;
    const client = createApiClient({ baseUrl: 'http://api/api', onUnauthenticated: vi.fn(), fetchImpl });

    await expect(client.request('/users')).rejects.toMatchObject({ status: 401 });
    expect(users).toBe(2);
  });

  it('surfaces the API error message', async () => {
    const fetchImpl = vi.fn(async () => json(403, { error: 'Cannot grant a role with permissions you do not hold' })) as unknown as typeof fetch;
    const client = createApiClient({ baseUrl: 'http://api/api', onUnauthenticated: vi.fn(), fetchImpl });

    await expect(client.request('/users', { method: 'POST', body: {} })).rejects.toThrow(
      'Cannot grant a role with permissions you do not hold',
    );
  });

  it('sends credentials and a JSON body', async () => {
    const fetchImpl = vi.fn(async () => json(200, {})) as unknown as typeof fetch;
    const client = createApiClient({ baseUrl: 'http://api/api', onUnauthenticated: vi.fn(), fetchImpl });
    await client.request('/x', { method: 'POST', body: { a: 1 } });

    const [, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(init.credentials).toBe('include');
    expect(init.body).toBe('{"a":1}');
  });

  it('sends FormData as-is so the browser sets the multipart boundary', async () => {
    const fetchImpl = vi.fn(async () => json(201, { ok: true }));
    const client = createApiClient({ baseUrl: 'http://api/api', onUnauthenticated: vi.fn(), fetchImpl: fetchImpl as never });
    const form = new FormData();
    form.append('name', 'x');
    await client.request('/upload', { method: 'POST', body: form });
    const init = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.body).toBe(form);
    expect(new Headers(init.headers).get('content-type')).toBeNull();
  });

  it('keeps the error body on ApiError so callers can read structured details', async () => {
    const fetchImpl = vi.fn(async () => json(400, { error: '1 row(s) have errors', issues: [{ rowNumber: 2 }] }));
    const client = createApiClient({ baseUrl: 'http://api/api', onUnauthenticated: vi.fn(), fetchImpl: fetchImpl as never });
    const err = await client.request('/x').catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 400, message: '1 row(s) have errors', body: { issues: [{ rowNumber: 2 }] } });
  });

  it('downloads a file with the name from Content-Disposition', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response('a,b', {
          status: 200,
          headers: { 'content-disposition': 'attachment; filename="departments-2026-10-28.csv"', 'content-type': 'text/csv' },
        }),
    );
    const client = createApiClient({ baseUrl: 'http://api/api', onUnauthenticated: vi.fn(), fetchImpl: fetchImpl as never });
    const file = await client.download('/departments/export?format=csv');
    expect(file.fileName).toBe('departments-2026-10-28.csv');
    expect(await file.blob.text()).toBe('a,b');
  });
});
