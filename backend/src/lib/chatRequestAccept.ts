import type { AppState } from "../../../src/lib/types.js";
import { getSnapshot, setSnapshot } from "../db/engine.js";
import { assertChatReadAccess, ChatAccessError } from "./chatAccess.js";

function stripPasswords(state: AppState): AppState {
  return {
    ...state,
    users: (state.users || []).map(u => ({ ...u, password: "" })),
  };
}

export async function acceptChatMessageRequest(
  userId: string,
  chatId: string,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  try {
    await assertChatReadAccess(userId, chatId);
  } catch (e) {
    if (e instanceof ChatAccessError) {
      return { ok: false, error: e.message, status: 403 };
    }
    throw e;
  }

  const snap = (await getSnapshot(userId)) as AppState | null;
  if (!snap?.chats?.length) {
    return { ok: false, error: "المحادثة غير موجودة", status: 404 };
  }

  let found = false;
  const chats = snap.chats.map(c => {
    if (c.id !== chatId && !c.members.includes(userId)) return c;
    const match =
      c.id === chatId ||
      (!c.isGroup && !c.isChannel && c.members.length === 2 && c.members.includes(userId));
    if (!match) return c;
    found = true;
    return { ...c, request: false };
  });

  if (!found) return { ok: false, error: "المحادثة غير موجودة", status: 404 };

  await setSnapshot(userId, stripPasswords({ ...snap, chats, currentUserId: userId }));

  const accepted = chats.find(c => c.id === chatId || c.request === false);
  if (accepted && !accepted.isGroup && !accepted.isChannel) {
    const peer = accepted.members.find(id => id !== userId);
    if (peer) {
      const { emitToUser } = await import("./realtimeSocket.js");
      emitToUser(peer, "chat_request_accepted", { chatId: accepted.id, byUserId: userId });
    }
  }

  return { ok: true };
}
