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

/** يمنع رفع لقطة localStorage قديمة فوق قاعدة البيانات الحقيقية */
export function shouldAllowRemotePush(state: AppState): boolean {
  if (!hydrated) return false;
  const uid = state.currentUserId;
  if (!uid) return true;
  const mine = (state.posts || []).filter(p => p.userId === uid).length;
  if (serverOwnerPostCount >= 2 && mine + 1 < serverOwnerPostCount) {
    console.warn(
      `[Retweet] تجاهل رفع لقطة قديمة (${mine} محلي / ${serverOwnerPostCount} على الخادم)`,
    );
    return false;
  }
  return true;
}
