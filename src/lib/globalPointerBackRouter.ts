import { isPointerOnDismissEdge, type DismissGestureProfile } from "@/lib/edgeSwipeDismiss";

/**
 * طبقة سحب للخلف — يُسجَّل كل SlideDismissShell / غرفة محادثة.
 * يعادل تهيئة GestureBinding / pointerRouter في Flutter.
 */
export type PointerBackLayer = {
  id: number;
  getContainer: () => HTMLElement | null;
  isActive: () => boolean;
  dismissProfile?: DismissGestureProfile;
  onEdgePointerDown: (e: PointerEvent) => void;
  onPointerMove: (e: PointerEvent) => void;
  onPointerUp: (e: PointerEvent) => void;
};

let nextLayerId = 1;
let installed = false;
const layers: PointerBackLayer[] = [];
let activePointerId: number | null = null;
let activeLayerId: number | null = null;

function topLayer(): PointerBackLayer | undefined {
  for (let i = layers.length - 1; i >= 0; i--) {
    const L = layers[i];
    if (L.isActive()) return L;
  }
  return undefined;
}

function isHeaderBackHandle(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return !!target.closest("[data-chat-dismiss-handle], [data-chat-back-btn], [data-profile-back-btn]");
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return !!target.closest(
    "button, a, input, select, textarea, label, [role='switch'], [role='button'], [data-no-dismiss-drag], [data-profile-menu-btn], [data-profile-back-btn], [data-chat-privacy-menu-btn], [data-profile-menu], [data-chat-privacy-menu]",
  );
}

function installDocumentRouter() {
  if (installed || typeof document === "undefined") return;
  installed = true;

  const onDown = (e: PointerEvent) => {
    if (e.button !== 0 || activePointerId != null) return;
    const layer = topLayer();
    if (!layer) return;
    const root = layer.getContainer();
    if (!root || !root.contains(e.target as Node)) return;
    const rect = root.getBoundingClientRect();
    const profile =
      root.dataset.chatDismissRtl === "1" ? "chat" : (layer.dismissProfile ?? "app");
    if (isInteractiveTarget(e.target) || isHeaderBackHandle(e.target)) return;
    if (document.documentElement.dataset.chatThreadOpen === "1" && profile === "app") return;
    if (!isPointerOnDismissEdge(e.clientX, rect, profile)) return;
    activePointerId = e.pointerId;
    activeLayerId = layer.id;
    layer.onEdgePointerDown(e);
    e.preventDefault();
    e.stopPropagation();
  };

  const onMove = (e: PointerEvent) => {
    if (activePointerId == null || e.pointerId !== activePointerId) return;
    const layer = layers.find(L => L.id === activeLayerId);
    if (!layer) return;
    layer.onPointerMove(e);
    e.preventDefault();
  };

  const onUp = (e: PointerEvent) => {
    if (activePointerId == null || e.pointerId !== activePointerId) return;
    const layer = layers.find(L => L.id === activeLayerId);
    activePointerId = null;
    activeLayerId = null;
    layer?.onPointerUp(e);
  };

  const resetActivePointer = () => {
    activePointerId = null;
    activeLayerId = null;
  };

  document.addEventListener("pointerdown", onDown, { capture: true, passive: false });
  document.addEventListener("pointermove", onMove, { capture: true, passive: false });
  document.addEventListener("pointerup", onUp, { capture: true });
  document.addEventListener("pointercancel", onUp, { capture: true });
  window.addEventListener("blur", resetActivePointer);
  document.addEventListener("visibilitychange", resetActivePointer);
}

/**
 * يُستدعى مرة عند إقلاع التطبيق (main.tsx / WebAppRoot).
 * يعادل: GestureBinding.instance.pointerRouter في Flutter.
 */
export function warmGlobalPointerBackRouter(): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.retweetPointerRouter = "1";
  installDocumentRouter();
}

export function registerPointerBackLayer(handlers: Omit<PointerBackLayer, "id">): () => void {
  warmGlobalPointerBackRouter();
  const layer: PointerBackLayer = { id: nextLayerId++, ...handlers };
  layers.push(layer);
  return () => {
    const idx = layers.findIndex(L => L.id === layer.id);
    if (idx >= 0) layers.splice(idx, 1);
    if (activeLayerId === layer.id) {
      activePointerId = null;
      activeLayerId = null;
    }
  };
}
