export type AppDragBounds = {
  minOffsetX: number;
  maxOffsetX: number;
  minOffsetY: number;
  maxOffsetY: number;
};

/** حدود السحب بالنسبة لموضع العنصر عند بداية السحب داخل حاوية التطبيق */
export function measureAppDragBounds(
  shellEl: HTMLElement | null,
  dragEl: HTMLElement | null,
): AppDragBounds | null {
  if (!shellEl || !dragEl || typeof shellEl.getBoundingClientRect !== "function") return null;
  const shell = shellEl.getBoundingClientRect();
  const drag = dragEl.getBoundingClientRect();
  return {
    minOffsetX: shell.left - drag.left,
    maxOffsetX: shell.right - drag.width - drag.left,
    minOffsetY: shell.top - drag.top,
    maxOffsetY: shell.bottom - drag.height - drag.top,
  };
}

export function clampOffsetX(x: number, bounds: AppDragBounds | null | undefined) {
  if (!bounds) return x;
  return Math.min(bounds.maxOffsetX, Math.max(bounds.minOffsetX, x));
}

export function clampOffsetY(y: number, bounds: AppDragBounds | null | undefined) {
  if (!bounds) return y;
  return Math.min(bounds.maxOffsetY, Math.max(bounds.minOffsetY, y));
}
