import { useEffect, useState } from "react";
import {
  buildPerfReport,
  emitPerfReport,
  getFrameHistory,
  getLeakRegistry,
  getLongTasks,
  getMemoryMb,
  getRenderCounts,
  getRenderDurations,
  getSlowRenders,
  startFrameMonitor,
  startPerfSession,
} from "@/lib/renderProfiler";
import { perfEnabled } from "@/lib/perfMark";

/** HUD أداء — localStorage.retweet_perf=1 */
export function PerfHUD() {
  const [visible, setVisible] = useState(false);
  const [frame, setFrame] = useState({ fps: 0, droppedFrames: 0, ts: 0 });
  const [mem, setMem] = useState<number | null>(null);
  const [topRenders, setTopRenders] = useState<[string, number][]>([]);

  useEffect(() => {
    if (!perfEnabled()) return;
    setVisible(true);
    const stopSession = startPerfSession();
    const stopFrame = startFrameMonitor(setFrame);
    const id = window.setInterval(() => {
      setTopRenders(
        [...getRenderCounts().entries()].sort((a, b) => b[1] - a[1]).slice(0, 8),
      );
      setMem(getMemoryMb());
    }, 2000);
    return () => {
      stopSession();
      stopFrame();
      window.clearInterval(id);
    };
  }, []);

  if (!visible) return null;

  const avgFps =
    getFrameHistory().reduce((a, s) => a + s.fps, 0) / Math.max(1, getFrameHistory().length);
  const leaks = getLeakRegistry().length;
  const longTasks = getLongTasks().length;

  return (
    <div
      className="pointer-events-auto fixed bottom-20 start-2 z-[99999] max-w-[12rem] rounded-lg border border-border/80 bg-black/90 px-2 py-1.5 font-mono text-[9px] leading-snug text-green-400 shadow-lg"
      aria-hidden
    >
      <div>FPS {frame.fps} ~{avgFps.toFixed(0)}</div>
      <div>drops {frame.droppedFrames}/s · long {longTasks}</div>
      <div>heap {mem ?? "?"}MB · leaks {leaks}</div>
      <div className="mt-1 border-t border-white/20 pt-1 text-[8px] text-zinc-400">
        {topRenders.map(([name, n]) => (
          <div key={name} className="truncate">
            {name}:{n}
          </div>
        ))}
      </div>
      <button
        type="button"
        className="mt-1 w-full rounded bg-white/10 py-0.5 text-[8px] text-white"
        onClick={() => {
          const r = emitPerfReport("manual");
          console.table(r.topRenderCounts);
          console.table(r.topSlowRenders);
        }}
      >
        Report
      </button>
    </div>
  );
}

export function getLatestPerfReport() {
  return buildPerfReport("query");
}
