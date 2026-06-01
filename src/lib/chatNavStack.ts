/** Production chat navigation stack — tap to open, right-edge swipe back (يمين → يسار) */

/** عرض منطقة الحافة اليمنى لبدء سحب الرجوع */
export const CHAT_NAV_EDGE_PX = 44;
export const CHAT_NAV_COMMIT_FRACTION = 0.28;
export const CHAT_NAV_MS = 220;
export const CHAT_NAV_EASE = "cubic-bezier(0.32, 0.72, 0, 1)";
/** px/ms — سحب سريع لليسار يكمل الرجوع */
export const CHAT_NAV_FLING_VX = 0.34;

export type ChatNavLayerRefs = {
  inboxEl: HTMLDivElement | null;
  roomEl: HTMLDivElement | null;
};

export function chatNavWidth(widthPx: number): number {
  return Math.max(260, Math.round(Number.isFinite(widthPx) ? widthPx : 390));
}

/** هل اللمس داخل منطقة الحافة اليمنى (22px) */
export function isChatNavBackEdge(
  clientX: number,
  containerRect: Pick<DOMRect, "left" | "width">,
  edgePx = CHAT_NAV_EDGE_PX,
): boolean {
  const x = clientX - containerRect.left;
  const w = containerRect.width;
  const hit = Math.max(16, edgePx);
  if (!Number.isFinite(w) || w <= 0) return false;
  return x >= w - hit && x <= w;
}

/** سحب أفقي من الحافة اليمنى → يسار (dx سالب) */
export function isChatNavBackSwipe(dx: number, dy: number): boolean {
  if (dx >= -4) return false;
  if (Math.abs(dy) > Math.abs(dx) * 1.12) return false;
  return true;
}

/** pullPx: 0 = محادثة مفتوحة، w = مغلقة — الغرفة فقط تتحرك يساراً */
export function chatNavDismissTransforms(pullPx: number, widthPx: number) {
  const w = chatNavWidth(widthPx);
  const pull = Math.max(0, Math.min(w, Number.isFinite(pullPx) ? pullPx : 0));
  const progress = pull / w;
  const openProgress = 1 - progress;
  const roomRadius = Math.round(progress * 14);
  return {
    progress: openProgress,
    pullPx: pull,
    dismissPull: progress,
    roomRadius,
    room: `translate3d(${-pull}px, 0, 0)`,
  };
}

/** مدة إكمال الرجوع — متناسبة مع المسافة المتبقية */
export function chatNavCompleteMs(pullPx: number, widthPx: number): number {
  const w = chatNavWidth(widthPx);
  const remaining = Math.max(0, w - Math.max(0, pullPx));
  const frac = w > 0 ? remaining / w : 1;
  return Math.max(100, Math.min(CHAT_NAV_MS, Math.round(CHAT_NAV_MS * frac)));
}

/** t: 0 = مغلق (غرفة خارج الشاشة يميناً)، 1 = مفتوح */
export function chatNavOpenTransforms(t: number, widthPx: number) {
  const w = chatNavWidth(widthPx);
  const p = Math.max(0, Math.min(1, t));
  /** نسبة مئوية — تطابق عرض الحاوية دائماً (يمنع فراغاً على iOS عند اختلاف cap عن العرض الفعلي) */
  const room =
    p >= 0.999
      ? "none"
      : `translate3d(${(100 * (1 - p)).toFixed(4)}%, 0, 0)`;
  /** القائمة تبقى بعرض الشاشة عند الراحة — parallax خفيف فقط أثناء الفتح */
  const inboxTx =
    p <= 0.001 || p >= 0.999 ? 0 : Math.round(-w * 0.05 * (1 - p));
  return {
    room,
    inbox: inboxTx === 0 ? "none" : `translate3d(${inboxTx}px, 0, 0)`,
  };
}

export function chatNavReleaseTarget(pullPx: number, widthPx: number, velocityX = 0): number {
  const w = chatNavWidth(widthPx);
  const threshold = w * CHAT_NAV_COMMIT_FRACTION;
  if (velocityX <= -CHAT_NAV_FLING_VX) return w;
  if (velocityX >= CHAT_NAV_FLING_VX * 0.75) return 0;
  return pullPx >= threshold ? w : 0;
}

export function applyChatNavDismissTransforms(
  pullPx: number,
  widthPx: number,
  layers: ChatNavLayerRefs,
  animate: boolean,
  durationMs = CHAT_NAV_MS,
): { progress: number; dismissPull: number; roomRadius: number } {
  const { progress, dismissPull, roomRadius, room } = chatNavDismissTransforms(pullPx, widthPx);
  const transition = animate ? `transform ${durationMs}ms ${CHAT_NAV_EASE}` : "none";
  /** القائمة ثابتة خلف المحادثة — لا نحرّكها أثناء السحب (Instagram-style) */
  if (layers.inboxEl) {
    layers.inboxEl.style.transition = "none";
    layers.inboxEl.style.transform = "none";
    layers.inboxEl.style.transformOrigin = "";
  }
  if (layers.roomEl) {
    layers.roomEl.style.transform = room;
    layers.roomEl.style.transition = transition;
    layers.roomEl.style.setProperty("--retweet-chat-room-radius", `${roomRadius}px`);
    layers.roomEl.style.setProperty("--retweet-chat-dismiss-pull", String(dismissPull));
  }
  return { progress, dismissPull, roomRadius };
}

export function applyChatNavOpenTransforms(
  t: number,
  widthPx: number,
  layers: ChatNavLayerRefs,
  animate: boolean,
): void {
  const { room, inbox } = chatNavOpenTransforms(t, widthPx);
  const transition = animate ? `transform ${CHAT_NAV_MS}ms ${CHAT_NAV_EASE}` : "none";
  if (layers.inboxEl) {
    layers.inboxEl.style.transform = inbox;
    layers.inboxEl.style.transformOrigin = "";
    layers.inboxEl.style.transition = transition;
  }
  if (layers.roomEl) {
    layers.roomEl.style.transform = room;
    layers.roomEl.style.transition = transition;
    layers.roomEl.style.removeProperty("--retweet-chat-room-radius");
    layers.roomEl.style.removeProperty("--retweet-chat-dismiss-pull");
  }
}

export function snapChatNavInboxRest(layers: ChatNavLayerRefs, widthPx?: number): void {
  if (layers.inboxEl) {
    layers.inboxEl.style.transform = "none";
    layers.inboxEl.style.transformOrigin = "";
    layers.inboxEl.style.transition = "none";
  }
  if (layers.roomEl) {
    const w = chatNavWidth(
      widthPx ??
        layers.roomEl.parentElement?.clientWidth ??
        (typeof window !== "undefined" ? window.innerWidth : 390),
    );
    const { room } = chatNavOpenTransforms(0, w);
    layers.roomEl.style.transform = room === "none" ? "translate3d(100%, 0, 0)" : room;
    layers.roomEl.style.transformOrigin = "";
    layers.roomEl.style.transition = "none";
    layers.roomEl.style.visibility = "";
    layers.roomEl.style.opacity = "";
    layers.roomEl.style.pointerEvents = "none";
    layers.roomEl.style.removeProperty("--retweet-chat-room-radius");
    layers.roomEl.style.removeProperty("--retweet-chat-dismiss-pull");
  }
}
