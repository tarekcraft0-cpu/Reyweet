export function isDocumentRtl(): boolean {
  return typeof document !== "undefined" && document.documentElement.getAttribute("dir") === "rtl";
}

/** عرض منطقة الحافة الفيزيائية اليسرى (أولوية على التمرير والفقاعات) */
export const EDGE_SWIPE_HIT_PX = 30;

/** حافة الرجوع في المحادثة — يمين الشاشة فقط (بجانب زر الرجوع) */
export const CHAT_EDGE_SWIPE_HIT_PX = 48;

/** أقل سحب أفقي لبدء الإيماءة من منتصف اللوحة */
export const PANEL_SWIPE_COMMIT_PX = 10;

/** محادثة: عتبة أقل — سحب يسارًا (يمين → يسار) */
export const CHAT_SWIPE_COMMIT_PX = 6;

/** سرعة أفقية (px/ms) لإغلاق المحادثة بسحب سريع لليسار */
export const CHAT_DISMISS_FLING_VX = 0.42;

/** شاشات التطبيق العامة مقابل غرفة المحادثة (زر الرجوع يمينًا في RTL) */
export type DismissGestureProfile = "app" | "chat";

/**
 * RTL (عربي): الرجوع = سحب من الحافة اليسرى نحو اليمين.
 * نستخدم الحافة الفيزيائية اليسرى لعمود التطبيق (ليس start المنطقي).
 */
export function isPointerOnPhysicalBackEdge(
  clientX: number,
  containerRect: Pick<DOMRect, "left" | "width">,
): boolean {
  const x = clientX - containerRect.left;
  return x >= 0 && x <= EDGE_SWIPE_HIT_PX;
}

/**
 * محادثة RTL: بدء السحب من الحافة اليمنى فقط.
 * يعادل: globalPosition.dx > screenWidth - 30 (نسبةً لعمود المحادثة).
 */
export function isPointerOnPhysicalChatBackEdge(
  clientX: number,
  containerRect: Pick<DOMRect, "left" | "width">,
  edgePx = CHAT_EDGE_SWIPE_HIT_PX,
): boolean {
  try {
    const x = clientX - (containerRect?.left ?? 0);
    const w = containerRect?.width ?? 0;
    const hit = Math.max(EDGE_SWIPE_HIT_PX, edgePx);
    if (!Number.isFinite(w) || w <= 0) return false;
    return x >= w - hit;
  } catch {
    return false;
  }
}

/** محادثة: دائماً RTL للرجوع (يمين → يسار) بغض النظر عن dir الصفحة */
export function resolveDismissRtl(profile: DismissGestureProfile = "app"): boolean {
  return profile === "chat" ? true : isDocumentRtl();
}

export function isPointerOnDismissEdge(
  clientX: number,
  containerRect: Pick<DOMRect, "left" | "width">,
  profile: DismissGestureProfile = "app",
): boolean {
  return profile === "chat"
    ? isPointerOnPhysicalChatBackEdge(clientX, containerRect)
    : isPointerOnPhysicalBackEdge(clientX, containerRect);
}

/** اتجاه السحب الصحيح لإغلاق الشاشة */
export function isDismissSwipeDelta(
  dx: number,
  dy: number,
  rtl = isDocumentRtl(),
  profile: DismissGestureProfile = "app",
): boolean {
  if (profile === "chat") return isChatDismissSwipeDelta(dx, dy);
  const commitPx = PANEL_SWIPE_COMMIT_PX;
  if (Math.abs(dx) < commitPx) return false;
  if (Math.abs(dy) > Math.abs(dx) * 1.08) return false;
  return rtl ? dx > 0 : dx < 0;
}

/** clamp ترجمة الإغلاق */
export function clampDismissTranslate(
  tx: number,
  widthPx: number,
  rtl = isDocumentRtl(),
  profile: DismissGestureProfile = "app",
): number {
  const w = Math.max(260, widthPx);
  if (profile === "chat") {
    return chatDismissClampTx(tx, w);
  }
  if (rtl) return Math.max(0, Math.min(w, tx));
  return Math.max(-w, Math.min(0, tx));
}

export function dismissTranslateToProgress(
  tx: number,
  widthPx: number,
  rtl = isDocumentRtl(),
  profile: DismissGestureProfile = "app",
): number {
  const w = Math.max(260, widthPx);
  if (profile === "chat") {
    return chatDismissProgress(tx, w);
  }
  if (rtl) return Math.max(0, Math.min(1, 1 - tx / w));
  return Math.max(0, Math.min(1, 1 + tx / w));
}

export function dismissReleaseTargetTx(
  tx: number,
  widthPx: number,
  rtl = isDocumentRtl(),
  profile: DismissGestureProfile = "app",
): number {
  const w = Math.max(260, widthPx);
  const threshold = Math.max(w * 0.28, 64);
  if (profile === "chat") {
    return chatDismissReleaseTarget(tx, w);
  }
  if (rtl) return tx >= threshold ? w : 0;
  return tx <= -threshold ? -w : 0;
}

/** محادثة: إزاحة سالبة — سحب الإصبع يمين→يسار */
export function chatDismissClampTx(tx: number, widthPx: number): number {
  const w = Math.max(260, widthPx);
  return Math.max(-w, Math.min(0, tx));
}

export function chatDismissProgress(tx: number, widthPx: number): number {
  const w = Math.max(260, widthPx);
  return Math.max(0, Math.min(1, 1 + tx / w));
}

export function chatDismissReleaseTarget(
  tx: number,
  widthPx: number,
  velocityX = 0,
): number {
  const w = Math.max(260, widthPx);
  const threshold = Math.max(w * 0.28, 64);
  const flingLeft = velocityX <= -CHAT_DISMISS_FLING_VX;
  const flingCancel = velocityX >= CHAT_DISMISS_FLING_VX * 0.85;
  if (flingLeft) return -w;
  if (flingCancel) return 0;
  return tx <= -threshold ? -w : 0;
}

export function chatDismissOffscreenTx(widthPx: number): number {
  return -Math.max(260, widthPx);
}

/** سحب لليسار (يمين → يسار) — dx سالب */
export function isChatDismissSwipeDelta(dx: number, dy: number): boolean {
  if (dx >= 0) return false;
  if (Math.abs(dx) < CHAT_SWIPE_COMMIT_PX) return false;
  if (Math.abs(dy) > Math.abs(dx) * 1.08) return false;
  return true;
}

/** لمس على الحافة اليسرى — لا يُستخدم للرجوع في المحادثة */
export function isPointerOnPhysicalChatFrontEdge(
  clientX: number,
  containerRect: Pick<DOMRect, "left" | "width">,
): boolean {
  const x = clientX - containerRect.left;
  return x >= 0 && x <= CHAT_EDGE_SWIPE_HIT_PX;
}

/** إزاحة اللوحة على الشاشة (0…w) من سحب الإصبع (tx سالب = يمين→يسار) */
export function chatDismissPanelTranslate(fingerTx: number, widthPx: number): number {
  const w = Math.max(260, widthPx);
  const t = Math.max(-w, Math.min(0, fingerTx));
  return -t;
}

/**
 * إغلاق المحادثة RTL: الإصبع يمين→يسار — الغرفة تخرج لليسار، القائمة تدخل من اليمين.
 * pull=0 (مفتوح): inbox=+w, room=0 — pull=w (مغلق): inbox=0, room=-w
 */
export function chatStackDismissTransforms(dragTx: number, widthPx: number) {
  try {
    const w = Math.max(260, Math.round(Number.isFinite(widthPx) ? widthPx : 390));
    const t = Math.max(-w, Math.min(0, Number.isFinite(dragTx) ? dragTx : 0));
    const pull = -t;
    const progress = Math.max(0, Math.min(1, 1 - pull / w));
    const inboxTx = Math.round(w - pull);
    return {
      progress,
      inbox: `translate3d(${inboxTx}px, 0, 0)`,
      room: `translate3d(${inboxTx - w}px, 0, 0)`,
    };
  } catch {
    return {
      progress: 0,
      inbox: "translate3d(0px, 0, 0)",
      room: "translate3d(0px, 0, 0)",
    };
  }
}
