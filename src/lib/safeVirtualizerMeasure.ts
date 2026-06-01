import type { Virtualizer } from "@tanstack/react-virtual";

/**
 * قياس ارتفاع صف افتراضي بدون حلقة resize على iOS/WKWebView.
 * @see https://github.com/TanStack/virtual/issues/924
 */
export function stableVirtualRowMeasure(
  element: HTMLElement,
  _entry: ResizeObserverEntry | undefined,
  instance: Virtualizer<HTMLElement, Element>,
): number {
  const index = instance.indexFromElement(element);
  const cached = instance.measurementsCache[index]?.size;
  const estimate =
    typeof instance.options.estimateSize === "function"
      ? instance.options.estimateSize(index)
      : instance.options.estimateSize;

  const rect = element.getBoundingClientRect();
  const h = Math.round(rect.height);
  const w = Math.round(rect.width);
  if (h < 8 || w < 8) return cached ?? estimate;

  if (cached != null && Math.abs(cached - h) <= 2) return cached;
  return h;
}
