/** TTL cache للاستجابات GET — stale-while-revalidate + dedupe للطلبات المتزامنة */

type CacheEntry<T> = { data: T; expiresAt: number; staleAt: number };

const store = new Map<string, CacheEntry<unknown>>();
const inFlight = new Map<string, Promise<unknown>>();

export function apiCacheGet<T>(key: string): { hit: T; stale: boolean } | null {
  const e = store.get(key) as CacheEntry<T> | undefined;
  if (!e) return null;
  const now = Date.now();
  if (now > e.expiresAt) {
    store.delete(key);
    return null;
  }
  return { hit: e.data, stale: now > e.staleAt };
}

export function apiCacheSet<T>(key: string, data: T, ttlMs: number, staleMs?: number): void {
  const now = Date.now();
  store.set(key, {
    data,
    expiresAt: now + ttlMs,
    staleAt: now + (staleMs ?? Math.floor(ttlMs * 0.7)),
  });
}

export function apiCacheInvalidate(prefix?: string): void {
  if (!prefix) {
    store.clear();
    inFlight.clear();
    return;
  }
  for (const k of store.keys()) {
    if (k.startsWith(prefix)) store.delete(k);
  }
  for (const k of inFlight.keys()) {
    if (k.startsWith(prefix)) inFlight.delete(k);
  }
}

/** جلب مع dedupe — طلبات متزامنة متطابقة تشارك نفس الـ Promise */
export async function apiCacheGetOrFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  opts?: { ttlMs?: number; staleMs?: number; force?: boolean },
): Promise<T> {
  const ttlMs = opts?.ttlMs ?? 60_000;
  const staleMs = opts?.staleMs ?? Math.floor(ttlMs * 0.65);

  if (!opts?.force) {
    const cached = apiCacheGet<T>(key);
    if (cached && !cached.stale) return cached.hit;
    if (cached?.stale) {
      void (async () => {
        try {
          const fresh = await apiCacheGetOrFetch(key, fetcher, { ...opts, force: true });
          apiCacheSet(key, fresh, ttlMs, staleMs);
        } catch {
          /* ignore background refresh */
        }
      })();
      return cached.hit;
    }
  }

  const pending = inFlight.get(key) as Promise<T> | undefined;
  if (pending) return pending;

  const p = fetcher()
    .then(result => {
      if (result !== null && result !== undefined) {
        apiCacheSet(key, result, ttlMs, staleMs);
      }
      return result;
    })
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, p);
  return p;
}
