import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * يؤجّل رسم الأبناء حتى يقترب العنصر من الشاشة — يخفّف بطء التمرير في الخلاصة.
 */
export function LazyInView({
  children,
  fallback,
  rootMargin = "280px 0px",
  minHeight = "min-h-[12rem]",
}: {
  children: ReactNode;
  fallback?: ReactNode;
  rootMargin?: string;
  minHeight?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return;
    const io = new IntersectionObserver(
      entries => {
        if (entries.some(e => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { root: null, rootMargin, threshold: 0.01 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [rootMargin, visible]);

  return (
    <div ref={ref} className={visible ? undefined : minHeight}>
      {visible ? children : (fallback ?? <div className={"w-full " + minHeight + " bg-muted/30"} />)}
    </div>
  );
}
