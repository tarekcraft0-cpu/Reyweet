/** TTL cache للاستجابات GET — stale-while-revalidate على العميل */

type CacheEntry<T> = { data: T; expiresAt: number; staleAt: number };

const store = new Map<string, CacheEntry<unknown>>();

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
    return;
  }
  for (const k of store.keys()) {
    if (k.startsWith(prefix)) store.delete(k);
  }
}
