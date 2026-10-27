import type { Request, RequestHandler } from 'express';

interface Options {
  windowMs: number;
  max: number;
  key: (req: Request) => string;
}

// One shared store keyed by limiter instance, so tests can reset every limiter at once.
const stores = new Set<Map<string, { count: number; resetAt: number }>>();

export function resetRateLimits(): void {
  for (const store of stores) store.clear();
}

// In-memory fixed window: enough for a single API process; a multi-instance deploy needs a shared store.
export function rateLimit({ windowMs, max, key }: Options): RequestHandler {
  const hits = new Map<string, { count: number; resetAt: number }>();
  stores.add(hits);
  return (req, res, next) => {
    const now = Date.now();
    const k = key(req);
    let entry = hits.get(k);
    if (!entry || entry.resetAt <= now) {
      // Expired entries are dropped lazily on the next sweep-by-insert to keep the map bounded.
      if (hits.size > 10_000) for (const [name, e] of hits) if (e.resetAt <= now) hits.delete(name);
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(k, entry);
    }
    entry.count += 1;
    if (entry.count > max) {
      res.set('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      res.status(429).json({ error: 'Too many attempts, try again later' });
      return;
    }
    next();
  };
}
