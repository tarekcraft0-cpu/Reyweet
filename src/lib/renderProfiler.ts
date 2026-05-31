import { useEffect, useLayoutEffect, useRef } from "react";
import { perfEnabled } from "./perfMark";

/* ── Render counts ── */
const renderCounts = new Map<string, number>();
const renderTimestamps = new Map<string, number[]>();
const renderDurations = new Map<string, { totalMs: number; count: number; maxMs: number }>();

/* ── Per user-action tracking ── */
let actionSeq = 0;
let actionLabel = "";
const actionRenders = new Map<string, number>();
const actionViolations: Array<{ action: string; component: string; count: number; ts: number }> = [];

/* ── Long tasks / slow renders ── */
const slowRenders: Array<{ component: string; ms: number; ts: number }> = [];
const longTasks: Array<{ ms: number; ts: number; name?: string }> = [];

/* ── Memory samples ── */
const memorySamples: Array<{ mb: number; ts: number }> = [];
let memoryIntervalId: number | null = null;
let reportIntervalId: number | null = null;

/* ── Leak registry ── */
type LeakEntry = { kind: string; owner: string; label: string; createdAt: number };
const leakRegistry = new Map<string, LeakEntry>();

export function registerLeakResource(
  id: string,
  kind: "interval" | "listener" | "socket" | "media" | "observer",
  owner: string,
  label: string,
): void {
  if (!perfEnabled()) return;
  leakRegistry.set(id, { kind, owner, label, createdAt: performance.now() });
}

export function unregisterLeakResource(id: string): void {
  leakRegistry.delete(id);
}

export function getLeakRegistry(): LeakEntry[] {
  return [...leakRegistry.values()];
}

/** بداية «إجراء مستخدم» — يُستدعى عند tap/send/navigate */
export function markPerfUserAction(label: string): void {
  if (!perfEnabled()) return;
  flushActionViolations();
  actionSeq += 1;
  actionLabel = label;
  actionRenders.clear();
}

function flushActionViolations(): void {
  if (!actionLabel) return;
  for (const [component, count] of actionRenders) {
    if (count > 3) {
      const v = { action: actionLabel, component, count, ts: performance.now() };
      actionViolations.push(v);
      console.warn(
        `[perf][action] "${actionLabel}" → ${component} rendered ${count}x (>3)`,
      );
    }
  }
}

export function useRenderCount(componentName: string): number {
  const countRef = useRef(0);
  countRef.current += 1;
  const n = countRef.current;

  if (perfEnabled()) {
    renderCounts.set(componentName, (renderCounts.get(componentName) ?? 0) + 1);
    const ts = renderTimestamps.get(componentName) ?? [];
    ts.push(performance.now());
    if (ts.length > 300) ts.shift();
    renderTimestamps.set(componentName, ts);

    if (actionLabel) {
      actionRenders.set(componentName, (actionRenders.get(componentName) ?? 0) + 1);
    }
  }

  return n;
}

/** render count + duration — يُسجّل >16ms كـ slow render */
export function useProfiledRender(componentName: string): void {
  useRenderCount(componentName);
  const startRef = useRef(0);
  startRef.current = performance.now();

  useEffect(() => {
    if (!perfEnabled()) return;
    const ms = performance.now() - startRef.current;
    const prev = renderDurations.get(componentName) ?? { totalMs: 0, count: 0, maxMs: 0 };
    renderDurations.set(componentName, {
      totalMs: prev.totalMs + ms,
      count: prev.count + 1,
      maxMs: Math.max(prev.maxMs, ms),
    });
    if (ms > 16) {
      slowRenders.push({ component: componentName, ms, ts: performance.now() });
      if (slowRenders.length > 200) slowRenders.shift();
      console.warn(`[perf][slow-render] ${componentName} ${ms.toFixed(1)}ms (>16ms)`);
    }
  });
}

export function getRenderCounts(): Map<string, number> {
  return new Map(renderCounts);
}

export function getRenderDurations(): Map<string, { totalMs: number; count: number; maxMs: number }> {
  return new Map(renderDurations);
}

export function getSlowRenders(): typeof slowRenders {
  return [...slowRenders];
}

export function getActionViolations(): typeof actionViolations {
  return [...actionViolations];
}

export function resetRenderCounts(): void {
  renderCounts.clear();
  renderTimestamps.clear();
  renderDurations.clear();
  slowRenders.length = 0;
  actionViolations.length = 0;
  memorySamples.length = 0;
}

/* ── FPS / frame drops ── */
export function startFrameMonitor(onSample: (sample: FrameSample) => void): () => void {
  if (!perfEnabled() || typeof requestAnimationFrame === "undefined") return () => {};

  let last = performance.now();
  let frames = 0;
  let dropped = 0;
  let rafId = 0;

  const tick = (now: number) => {
    const delta = now - last;
    if (delta > 0) {
      frames += 1;
      if (delta > 20) dropped += Math.floor(delta / 16.67) - 1;
    }
    if (now - last >= 1000) {
      onSample({ fps: frames, droppedFrames: dropped, ts: now });
      frames = 0;
      dropped = 0;
      last = now;
    }
    rafId = requestAnimationFrame(tick);
  };

  rafId = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(rafId);
}

export type FrameSample = { fps: number; droppedFrames: number; ts: number };

const frameHistory: FrameSample[] = [];

export function getFrameHistory(): FrameSample[] {
  return [...frameHistory];
}

export function pushFrameSample(s: FrameSample): void {
  frameHistory.push(s);
  if (frameHistory.length > 60) frameHistory.shift();
}

export function getMemoryMb(): number | null {
  const perf = performance as Performance & { memory?: { usedJSHeapSize: number } };
  if (!perf.memory) return null;
  return Math.round((perf.memory.usedJSHeapSize / 1048576) * 10) / 10;
}

/** PerformanceObserver للـ long tasks (>50ms blocking) */
export function startLongTaskObserver(): () => void {
  if (!perfEnabled() || typeof PerformanceObserver === "undefined") return () => {};
  try {
    const obs = new PerformanceObserver(list => {
      for (const e of list.getEntries()) {
        const ms = e.duration;
        if (ms > 16) {
          longTasks.push({ ms, ts: performance.now(), name: e.name });
          if (longTasks.length > 100) longTasks.shift();
          if (ms > 50) {
            console.warn(`[perf][longtask] ${ms.toFixed(0)}ms ${e.name || ""}`);
          }
        }
      }
    });
    obs.observe({ entryTypes: ["longtask"] as PerformanceEntryList });
    return () => obs.disconnect();
  } catch {
    return () => {};
  }
}

export function getLongTasks(): typeof longTasks {
  return [...longTasks];
}

/** يبدأ sampling الذاكرة + تقرير كل 10 دقائق */
export function startPerfSession(): () => void {
  if (!perfEnabled()) return () => {};

  const stopFrame = startFrameMonitor(pushFrameSample);
  const stopLong = startLongTaskObserver();

  const memId = window.setInterval(() => {
    const mb = getMemoryMb();
    if (mb != null) memorySamples.push({ mb, ts: performance.now() });
    if (memorySamples.length > 600) memorySamples.shift();
  }, 10_000);

  memoryIntervalId = memId;

  const reportId = window.setInterval(() => {
    emitPerfReport("10min");
  }, 600_000);

  reportIntervalId = reportId;

  registerLeakResource("perf-session-mem", "interval", "renderProfiler", "memory-sample");
  registerLeakResource("perf-session-report", "interval", "renderProfiler", "10min-report");

  return () => {
    stopFrame();
    stopLong();
    if (memoryIntervalId != null) window.clearInterval(memoryIntervalId);
    if (reportIntervalId != null) window.clearInterval(reportIntervalId);
    unregisterLeakResource("perf-session-mem");
    unregisterLeakResource("perf-session-report");
    emitPerfReport("session-end");
  };
}

export type PerfReport = {
  generatedAt: string;
  reason: string;
  topRenderCounts: Array<{ name: string; count: number }>;
  topSlowRenders: Array<{ name: string; avgMs: number; maxMs: number }>;
  memoryStartMb: number | null;
  memoryEndMb: number | null;
  memoryGrowthMb: number | null;
  actionViolations: typeof actionViolations;
  leakCount: number;
  longTaskCount: number;
  remainingBottlenecks: string[];
};

export function buildPerfReport(reason: string): PerfReport {
  const topRenderCounts = [...renderCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([name, count]) => ({ name, count }));

  const topSlowRenders = [...renderDurations.entries()]
    .map(([name, d]) => ({
      name,
      avgMs: d.count ? d.totalMs / d.count : 0,
      maxMs: d.maxMs,
    }))
    .sort((a, b) => b.maxMs - a.maxMs)
    .slice(0, 15);

  const memStart = memorySamples[0]?.mb ?? null;
  const memEnd = memorySamples[memorySamples.length - 1]?.mb ?? getMemoryMb();
  const memoryGrowthMb =
    memStart != null && memEnd != null ? Math.round((memEnd - memStart) * 10) / 10 : null;

  return {
    generatedAt: new Date().toISOString(),
    reason,
    topRenderCounts,
    topSlowRenders,
    memoryStartMb: memStart,
    memoryEndMb: memEnd,
    memoryGrowthMb,
    actionViolations: [...actionViolations],
    leakCount: leakRegistry.size,
    longTaskCount: longTasks.length,
    remainingBottlenecks: [
      "App.tsx shell still re-renders on currentUser profile field changes",
      "ChatRoom inline message map — only ChatSwipeMessageRow is memoized",
      "Keep-alive tabs mount all panels simultaneously",
      "state.posts patch still updates HomeFeedCtx on likes (single post only)",
    ],
  };
}

export function emitPerfReport(reason: string): PerfReport {
  const report = buildPerfReport(reason);
  console.info("[perf][report]", JSON.stringify(report, null, 2));
  try {
    (window as Window & { __retweetPerfReport?: PerfReport }).__retweetPerfReport = report;
  } catch {
    /* ignore */
  }
  return report;
}

export function getLastPerfReport(): PerfReport | null {
  return (window as Window & { __retweetPerfReport?: PerfReport }).__retweetPerfReport ?? null;
}

/** Hook: interval مع تتبع تسريبات */
export function usePerfInterval(
  owner: string,
  label: string,
  fn: () => void,
  ms: number,
  enabled = true,
): void {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => fnRef.current(), ms);
    const key = `${owner}:${label}:${id}`;
    registerLeakResource(key, "interval", owner, label);
    return () => {
      window.clearInterval(id);
      unregisterLeakResource(key);
    };
  }, [owner, label, ms, enabled]);
}

/** Hook: listener مع تتبع */
export function usePerfListener<K extends keyof WindowEventMap>(
  owner: string,
  label: string,
  target: Window | Document | HTMLElement | null,
  type: K,
  handler: (e: WindowEventMap[K]) => void,
  opts?: AddEventListenerOptions,
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!target) return;
    const wrapped = (e: Event) => handlerRef.current(e as WindowEventMap[K]);
    const key = `${owner}:${label}:${String(type)}`;
    registerLeakResource(key, "listener", owner, label);
    target.addEventListener(type, wrapped as EventListener, opts);
    return () => {
      target.removeEventListener(type, wrapped as EventListener, opts);
      unregisterLeakResource(key);
    };
  }, [owner, label, target, type, opts?.capture, opts?.passive, opts?.once]);
}

/** يُصدّر window.retweetMarkAction للاختبار اليدوي */
if (typeof window !== "undefined" && perfEnabled()) {
  (window as Window & { retweetMarkAction?: typeof markPerfUserAction }).retweetMarkAction =
    markPerfUserAction;
  (window as Window & { __retweetGetRenderCounts?: () => [string, number][] }).__retweetGetRenderCounts =
    () => [...renderCounts.entries()];
  (window as Window & { __retweetGetSlowRenders?: () => typeof slowRenders }).__retweetGetSlowRenders =
    () => getSlowRenders();
}
