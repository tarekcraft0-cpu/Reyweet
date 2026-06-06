import { a as apiFetch } from "./index-HvwV1MnX.js";
import "./server-C_9mn7Dm.js";
import "node:async_hooks";
import "node:stream/web";
import "node:stream";
import "fs";
import "url";
import "./worker-entry-zAIx4FeG.js";
import "node:events";
import "http";
import "https";
import "./router-Ey6aJVb3.js";
import "util";
import "stream";
import "zlib";
import "assert";
import "buffer";
async function apiFetchChatMessagesPage(token, chatId, opts) {
  const qs = new URLSearchParams();
  if (opts?.limit) qs.set("limit", String(opts.limit));
  if (opts?.before) qs.set("before", String(opts.before));
  const suffix = qs.toString() ? `?${qs}` : "";
  const res = await apiFetch(`/v1/chats/${encodeURIComponent(chatId)}/messages${suffix}`, {
    method: "GET",
    token
  });
  if (!res.ok) return { messages: [], hasMore: false };
  const data = await res.json().catch(() => null);
  return {
    messages: data?.messages ?? [],
    hasMore: data?.hasMore === true,
    nextCursor: typeof data?.nextCursor === "number" && Number.isFinite(data.nextCursor) ? data.nextCursor : void 0
  };
}
const CHAT_MESSAGES_PAGE_SIZE = 80;
export {
  CHAT_MESSAGES_PAGE_SIZE,
  apiFetchChatMessagesPage
};
