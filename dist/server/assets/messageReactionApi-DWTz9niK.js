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
async function apiSetMessageReaction(token, chatId, messageId, emoji) {
  const res = await apiFetch(
    `/v1/chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(messageId)}/reaction`,
    {
      method: "PUT",
      token,
      body: JSON.stringify({ emoji })
    }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: data.error || "تعذر حفظ التفاعل" };
  if (!data.message) return { ok: false, error: "استجابة غير صالحة" };
  return { ok: true, message: data.message };
}
export {
  apiSetMessageReaction
};
