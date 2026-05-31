/** أدوات قياس الأداء — تُفعَّل في DEV أو عند `localStorage.retweet_perf=1` */

const ENABLED =
  typeof import.meta !== "undefined" &&
  (import.meta.env?.DEV ||
    (typeof localStorage !== "undefined" && localStorage.getItem("retweet_perf") === "1"));

const screenMounts = new Map<string, number>();

export function perfEnabled(): boolean {
  return !!ENABLED;
}

export function perfMark(name: string): void {
  if (!ENABLED || typeof performance === "undefined") return;
  try {
    performance.mark(name);
  } catch {
    /* ignore */
  }
}

export function perfMeasure(name: string, startMark: string, endMark?: string): number | null {
  if (!ENABLED || typeof performance === "undefined") return null;
  try {
    performance.measure(name, startMark, endMark);
    const entries = performance.getEntriesByName(name, "measure");
    const last = entries[entries.length - 1];
    return last?.duration ?? null;
  } catch {
    return null;
  }
}

export async function perfAsync<T>(label: string, fn: () => Promise<T>): Promise<T> {
  if (!ENABLED) return fn();
  const start = `${label}-start`;
  const end = `${label}-end`;
  perfMark(start);
  try {
    return await fn();
  } finally {
    perfMark(end);
    const ms = perfMeasure(label, start, end);
    if (ms != null && ms > 50) {
      console.info(`[perf] ${label}: ${ms.toFixed(1)}ms`);
    }
  }
}

export function perfScreenMount(screenName: string): void {
  if (!ENABLED) return;
  screenMounts.set(screenName, performance.now());
  console.info(`[perf] screen:${screenName} mount`);
}

export function perfLogMemory(label: string): void {
  if (!ENABLED) return;
  const perf = performance as Performance & {
    memory?: { usedJSHeapSize: number; totalJSHeapSize: number };
  };
  const mem = perf.memory;
  if (!mem) return;
  const usedMb = (mem.usedJSHeapSize / 1048576).toFixed(1);
  console.info(`[perf] memory:${label} ${usedMb}MB heap`);
}

export function perfGetScreenStats(): Array<{ screen: string; mountMs: number }> {
  const now = performance.now();
  return [...screenMounts.entries()].map(([screen, t]) => ({
    screen,
    mountMs: Math.round(now - t),
  }));
}

export function perfReportSlowOps(thresholdMs = 16): void {
  if (!ENABLED || typeof performance === "undefined") return;
  const measures = performance.getEntriesByType("measure");
  for (const m of measures) {
    if (m.duration > thresholdMs) {
      console.info(`[perf] slow ${m.name}: ${m.duration.toFixed(1)}ms`);
    }
  }
}
