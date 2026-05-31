import { useEffect, useRef } from "react";
import { perfLogMemory, perfMark, perfMeasure, perfScreenMount } from "./perfMark";

/** قياس زمن mount/update لكل شاشة — DEV أو retweet_perf=1 */
export function useScreenPerf(screenName: string, opts?: { active?: boolean }) {
  const active = opts?.active ?? true;
  const mountMark = useRef(`${screenName}-mount-${Math.random().toString(36).slice(2, 8)}`);
  const mounted = useRef(false);

  useEffect(() => {
    if (!active) return;
    const mark = mountMark.current;
    perfMark(`${mark}-start`);
    perfScreenMount(screenName);
    mounted.current = true;
    perfLogMemory(screenName);

    return () => {
      if (!mounted.current) return;
      perfMark(`${mark}-end`);
      perfMeasure(`screen:${screenName}`, `${mark}-start`, `${mark}-end`);
    };
  }, [screenName, active]);
}
