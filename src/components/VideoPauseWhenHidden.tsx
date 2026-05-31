import { useEffect, useRef, type ReactNode } from "react";
import { registerLeakResource, unregisterLeakResource } from "@/lib/renderProfiler";

/** يوقف الفيديو/الصوت عند خروج العنصر من الشاشة */
export function VideoPauseWhenHidden({
  children,
  rootMargin = "80px 0px",
  pauseAudio = true,
}: {
  children: ReactNode;
  rootMargin?: string;
  pauseAudio?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root || typeof IntersectionObserver === "undefined") return;

    const pauseMedia = () => {
      for (const v of root.querySelectorAll("video")) {
        v.pause();
        try {
          v.currentTime = 0;
        } catch {
          /* ignore */
        }
      }
      if (pauseAudio) {
        for (const a of root.querySelectorAll("audio")) {
          a.pause();
        }
      }
    };

    const io = new IntersectionObserver(
      entries => {
        for (const e of entries) {
          if (!e.isIntersecting) pauseMedia();
        }
      },
      { root: null, rootMargin, threshold: 0.08 },
    );
    io.observe(root);
    const key = `io:${rootMargin}`;
    registerLeakResource(key, "observer", "VideoPauseWhenHidden", rootMargin);
    return () => {
      io.disconnect();
      unregisterLeakResource(key);
      pauseMedia();
    };
  }, [rootMargin, pauseAudio]);

  return <div ref={ref}>{children}</div>;
}
