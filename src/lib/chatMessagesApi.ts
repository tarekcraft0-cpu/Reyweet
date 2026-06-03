import type { ID, Message } from "./types";
import { apiFetch } from "./apiBackend";
import { mergeChatMessages } from "./apiBackend";

export type ChatMessagesPage = {
  messages: Message[];
  hasMore: boolean;
  nextCursor?: number;
};

export async function apiFetchChatMessagesPage(
  token: string,
  chatId: ID,
  opts?: { limit?: number; before?: number },
): Promise<ChatMessagesPage> {
  const qs = new URLSearchParams();
  if (opts?.limit) qs.set("limit", String(opts.limit));
  if (opts?.before) qs.set("before", String(opts.before));
  const suffix = qs.toString() ? `?${qs}` : "";
  const res = await apiFetch(`/v1/chats/${encodeURIComponent(chatId)}/messages${suffix}`, {
    method: "GET",
    token,
  });
  if (!res.ok) return { messages: [], hasMore: false };
  const data = (await res.json().catch(() => null)) as {
    messages?: Message[];
    hasMore?: boolean;
    nextCursor?: number;
  } | null;
  return {
    messages: data?.messages ?? [],
    hasMore: data?.hasMore === true,
    nextCursor:
      typeof data?.nextCursor === "number" && Number.isFinite(data.nextCursor)
        ? data.nextCursor
        : undefined,
  };
}

/** حجم صفحة التحميل الافتراضي (فتح محادثة / تحميل أقدم) */
export const CHAT_MESSAGES_PAGE_SIZE = 80;

/** يجلب كل صفحات الرسائل (استخدمه فقط عند الحاجة — ثقيل على المحادثات الطويلة). */
export async function apiFetchAllChatMessages(
  token: string,
  chatId: ID,
  pageSize = 500,
): Promise<Message[]> {
  let all: Message[] = [];
  let before: number | undefined;
  for (let page = 0; page < 500; page++) {
    const chunk = await apiFetchChatMessagesPage(token, chatId, {
      limit: pageSize,
      before,
    });
    if (!chunk.messages.length) break;
    all = mergeChatMessages(all, chunk.messages);
    if (!chunk.hasMore || chunk.nextCursor == null) break;
    before = chunk.nextCursor;
  }
  return all;
}
