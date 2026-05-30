import type { AppState } from "./types";

let hydrated = false;
let serverOwnerPostCount = 0;

export function markServerHydrated(ownerId: string | null, state: AppState): void {
  hydrated = true;
  if (!ownerId) {
    serverOwnerPostCount = 0;
    return;
  }
  serverOwnerPostCount = (state.posts || []).filter(p => p.userId === ownerId).length;
}

export function resetServerHydrated(): void {
  hydrated = false;
  serverOwnerPostCount = 0;
}

/**
 * يمنع رفع لقطة فارغة فوق بيانات الخادم فقط.
 * لا نقارن العدد الكامل: الجهاز قد يحتفظ بجزء من المنشورات بينما posts.json فيه التاريخ كاملاً.
 */
export function shouldAllowRemotePush(state: AppState, opts?: { force?: boolean }): boolean {
  if (opts?.force) return true;
  if (!hydrated) return false;
  const uid = state.currentUserId;
  if (!uid) return true;
  const mine = (state.posts || []).filter(p => p.userId === uid).length;
  if (serverOwnerPostCount > 0 && mine === 0) {
    console.warn(
      `[Retweet] تجاهل رفع لقطة بلا منشورات (${serverOwnerPostCount} على الخادم)`,
    );
    return false;
  }
  return true;
}
