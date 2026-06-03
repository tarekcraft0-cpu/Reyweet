import { apiFetch } from "./apiBackend";
import type { ID, Message } from "./types";

export async function apiSetMessageReaction(
  token: string,
  chatId: ID,
  messageId: ID,
  emoji: string,
): Promise<{ ok: true; message: Message } | { ok: false; error: string }> {
  const res = await apiFetch(
    `/v1/chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(messageId)}/reaction`,
    {
      method: "PUT",
      token,
      body: JSON.stringify({ emoji }),
    },
  );
  const data = (await res.json().catch(() => ({}))) as { message?: Message; error?: string };
  if (!res.ok) return { ok: false, error: data.error || "تعذر حفظ التفاعل" };
  if (!data.message) return { ok: false, error: "استجابة غير صالحة" };
  return { ok: true, message: data.message };
}
