/** Production chat navigation stack — tap to open, right-edge swipe back (يمين → يسار) */

/** عرض منطقة الحافة اليمنى لبدء سحب الرجوع */
export const CHAT_NAV_EDGE_PX = 44;
export const CHAT_NAV_COMMIT_FRACTION = 0.28;
export const CHAT_NAV_MS = 220;
export const CHAT_NAV_OPEN_MS = 300;
export const CHAT_NAV_EASE = "cubic-bezier(0.32, 0.72, 0, 1)";
export const CHAT_NAV_OPEN_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
/** px/ms — سحب سريع لليسار يكمل الرجوع */
export const CHAT_NAV_FLING_VX = 0.34;

function easeOutCubic(t: number): number {
  const p = Math.max(0, Math.min(1, t));
  return 1 - Math.pow(1 - p, 3);
}

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
  const roomRadius = Math.round(progress * 12 + progress * progress * 4);
  const scale = 1 - progress * 0.048;
  return {
    progress: openProgress,
    pullPx: pull,
    dismissPull: progress,
    roomRadius,
    room: `translate3d(${-pull}px, 0, 0) scale(${scale.toFixed(4)})`,
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
  const p = Math.max(0, Math.min(1, t));
  const w = chatNavWidth(widthPx);
  const roomPct = 100 * (1 - p);
  const roomScale = 0.94 + 0.06 * p;
  const room =
    p >= 0.999
      ? "none"
      : `translate3d(${roomPct.toFixed(4)}%, 0, 0) scale(${roomScale.toFixed(4)})`;
  const inboxTx = Math.round(-p * w * 0.2);
  const inboxScale = 1 - p * 0.035;
  const inbox =
    p < 0.001
      ? "none"
      : `translate3d(${inboxTx}px, 0, 0) scale(${inboxScale.toFixed(4)})`;
  return {
    room,
    inbox,
    openProgress: p,
    dismissPull: 1 - p,
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
    layers.inboxEl.style.transformOrigin = "center right";
    layers.inboxEl.style.filter = "";
  }
  if (layers.roomEl) {
    layers.roomEl.style.transformOrigin = "center right";
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
  tapOpen = false,
): void {
  const { room, inbox } = chatNavOpenTransforms(t, widthPx);
  const ms = tapOpen ? CHAT_NAV_OPEN_MS : CHAT_NAV_MS;
  const ease = tapOpen ? CHAT_NAV_OPEN_EASE : CHAT_NAV_EASE;
  const transition = animate ? `transform ${ms}ms ${ease}, filter ${ms}ms ease` : "none";
  if (layers.inboxEl) {
    layers.inboxEl.style.transform = inbox;
    layers.inboxEl.style.transformOrigin = "center right";
    layers.inboxEl.style.transition = transition;
    layers.inboxEl.style.filter = t > 0.02 ? `brightness(${1 - t * 0.06})` : "";
    if (t < 0.001) layers.inboxEl.dataset.inboxAtRest = "true";
    else delete layers.inboxEl.dataset.inboxAtRest;
  }
  if (layers.roomEl) {
    layers.roomEl.style.visibility = "";
    layers.roomEl.style.pointerEvents = t > 0.02 ? "auto" : "none";
    layers.roomEl.style.opacity = "1";
    layers.roomEl.style.transformOrigin = "center right";
    layers.roomEl.style.transform = room;
    layers.roomEl.style.transition = transition;
    layers.roomEl.style.removeProperty("--retweet-chat-room-radius");
    layers.roomEl.style.setProperty("--retweet-chat-dismiss-pull", String(Math.max(0, 1 - t)));
  }
}

/**
 * فتح تفاعلي بالنقر — غرفة من اليمين + القائمة تتحرك قليلاً (Instagram DM).
 * يُرجع إلغاء الرسوم إن لزم.
 */
export function runChatNavOpenAnimation(
  widthPx: number,
  layers: ChatNavLayerRefs,
  onFrame: (t: number) => void,
  onDone: () => void,
): () => void {
  let cancelled = false;
  const cap = chatNavWidth(widthPx);
  applyChatNavOpenTransforms(0, cap, layers, false);
  onFrame(0);
  const start = performance.now();
  const tick = (now: number) => {
    if (cancelled) return;
    const raw = Math.min(1, (now - start) / CHAT_NAV_OPEN_MS);
    const t = easeOutCubic(raw);
    applyChatNavOpenTransforms(t, cap, layers, false);
    onFrame(t);
    if (raw < 1) {
      requestAnimationFrame(tick);
      return;
    }
    applyChatNavOpenTransforms(1, cap, layers, false);
    onFrame(1);
    onDone();
  };
  requestAnimationFrame(tick);
  return () => {
    cancelled = true;
  };
}

export function snapChatNavInboxRest(layers: ChatNavLayerRefs, widthPx?: number): void {
  if (layers.inboxEl) {
    layers.inboxEl.style.transform = "none";
    layers.inboxEl.style.transformOrigin = "";
    layers.inboxEl.style.transition = "none";
    layers.inboxEl.style.left = "0";
    layers.inboxEl.style.right = "0";
    layers.inboxEl.style.width = "100%";
    layers.inboxEl.style.maxWidth = "100%";
    layers.inboxEl.dataset.inboxAtRest = "true";
  }
  if (layers.roomEl) {
    layers.roomEl.style.left = "0";
    layers.roomEl.style.right = "0";
    layers.roomEl.style.width = "100%";
    layers.roomEl.style.maxWidth = "100%";
    layers.roomEl.style.transform = "translate3d(100%, 0, 0)";
    layers.roomEl.style.transformOrigin = "";
    layers.roomEl.style.transition = "none";
    layers.roomEl.style.visibility = "hidden";
    layers.roomEl.style.opacity = "";
    layers.roomEl.style.pointerEvents = "none";
    layers.roomEl.style.removeProperty("--retweet-chat-room-radius");
    layers.roomEl.style.removeProperty("--retweet-chat-dismiss-pull");
  }
}
