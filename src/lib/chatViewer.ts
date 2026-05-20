import { resolveActiveViewerId } from "./resolveUserProfile";
import { isGuestUserId } from "./guestUser";
import type { AppState, ID } from "./types";

export { resolveActiveViewerId, resolveActiveViewer } from "./resolveUserProfile";

/**
 * هل الرسالة من الحساب النشط؟
 * يعتمد فقط على مطابقة senderId مع المعرّف المصدَّق (لا استنتاج من الطرف الآخر).
 */
export function isOwnChatMessage(
  senderId: ID,
  state: AppState,
  _options?: { directMessagePeerId?: ID | null },
): boolean {
  const viewerId = resolveActiveViewerId(state);
  if (!viewerId || isGuestUserId(viewerId)) return false;
  return senderId === viewerId;
}
