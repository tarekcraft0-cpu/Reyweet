export type ChatScrollIntroHandle = { cancel: () => void };

/** تمرير سريع ومرئي لأسفل عند فتح المحادثة — يتبع نمو المحتوى أثناء التحميل */
export function animateChatScrollToBottom(
  el: HTMLElement,
  opts?: { minMs?: number; maxMs?: number; onDone?: () => void },
): ChatScrollIntroHandle {
  let cancelled = false;
  let raf = 0;

  const getTarget = () => Math.max(0, el.scrollHeight - el.clientHeight);

  const startAnim = () => {
    const start = el.scrollTop;
    const initialTarget = getTarget();
    const dist = initialTarget - start;
    if (dist < 3) {
      el.scrollTop = initialTarget;
      opts?.onDone?.();
      return;
    }

    const minMs = opts?.minMs ?? 260;
    const maxMs = opts?.maxMs ?? 520;
    const duration = Math.min(maxMs, Math.max(minMs, Math.sqrt(dist) * 5.5));
    const t0 = performance.now();

    const tick = (now: number) => {
      if (cancelled) return;
      const p = Math.min(1, (now - t0) / duration);
      const ease = 1 - (1 - p) ** 3;
      const target = getTarget();
      el.scrollTop = start + (target - start) * ease;
      if (p < 1) {
        raf = requestAnimationFrame(tick);
        return;
      }
      el.scrollTop = target;
      opts?.onDone?.();
    };

    raf = requestAnimationFrame(tick);
  };

  raf = requestAnimationFrame(startAnim);

  return {
    cancel: () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
    },
  };
}
