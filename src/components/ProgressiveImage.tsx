import { cn } from "@/lib/utils";
import { resolveMediaUrl, thumbnailMediaUrl } from "@/lib/mediaUrl";
import { useEffect, useMemo, useRef, useState } from "react";

type Props = {
  src: string;
  alt?: string;
  className?: string;
  /** eager للصورة الأولى/البروفايل */
  priority?: boolean;
  onClick?: () => void;
};

/**
 * صورة تدريجية: placeholder خفيف → thumb إن وُجد → الأصل.
 * تُلغى التحميل خارج الشاشة عبر IntersectionObserver.
 */
export function ProgressiveImage({ src, alt = "", className, priority = false, onClick }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(priority);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  const resolved = useMemo(() => resolveMediaUrl(src) || src, [src]);
  const thumb = useMemo(() => thumbnailMediaUrl(resolved), [resolved]);

  useEffect(() => {
    if (priority) {
      setVisible(true);
      return;
    }
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      entries => {
        if (entries.some(e => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "320px 0px", threshold: 0.01 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [priority, resolved]);

  useEffect(() => {
    setLoaded(false);
    setFailed(false);
  }, [resolved]);

  const showSrc = visible && !failed ? (loaded || !thumb ? resolved : thumb) : undefined;

  const inner = (
    <div ref={rootRef} className={cn("relative overflow-hidden bg-muted/40", className)}>
      {!loaded && (
        <div
          className="absolute inset-0 animate-pulse bg-muted/60"
          aria-hidden
        />
      )}
      {visible && showSrc && (
        <img
          src={showSrc}
          alt={alt}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          draggable={false}
          className={cn(
            "h-full w-full object-cover transition-opacity duration-300",
            loaded ? "opacity-100" : "opacity-0",
          )}
          onLoad={() => {
            if (showSrc === thumb && thumb !== resolved) {
              const full = new Image();
              full.src = resolved;
              full.onload = () => setLoaded(true);
            } else {
              setLoaded(true);
            }
          }}
          onError={() => setFailed(true)}
          onClick={onClick}
        />
      )}
    </div>
  );

  if (onClick) {
    return (
      <button type="button" className="block w-full border-0 p-0 bg-transparent" onClick={onClick}>
        {inner}
      </button>
    );
  }
  return inner;
}
