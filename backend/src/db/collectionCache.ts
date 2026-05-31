/**
 * ذاكرة قصيرة المدى لقراءات JSON الكاملة — يقلّل parse متكرر في نفس الطلب/الدورة.
 * تُبطل عند أي كتابة عبر invalidateCollectionCache().
 */

const TTL_MS = 4_000;
const cache = new Map<string, { data: unknown; expiresAt: number }>();

export function readCached<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  const now = Date.now();
  if (hit && hit.expiresAt > now) return Promise.resolve(hit.data as T);
  return loader().then(data => {
    cache.set(key, { data, expiresAt: now + TTL_MS });
    return data;
  });
}

export function invalidateCollectionCache(keys?: string[]): void {
  if (!keys) {
    cache.clear();
    return;
  }
  for (const k of keys) cache.delete(k);
}
