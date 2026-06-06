import type { Chat, ID } from "./types";
import { chatHasUnread } from "./chatInboxUtils";

export type ChatInboxFilterId = "all" | "unread" | "groups";

export type ChatInboxFilterOption = {
  id: ChatInboxFilterId;
  labelAr: string;
  labelEn: string;
};

export const CHAT_INBOX_FILTERS: ChatInboxFilterOption[] = [
  { id: "all", labelAr: "الكل", labelEn: "All" },
  { id: "unread", labelAr: "غير مقروءة", labelEn: "Unread" },
  { id: "groups", labelAr: "المجموعات", labelEn: "Groups" },
];

export function isChatInboxFilterId(v: unknown): v is ChatInboxFilterId {
  return v === "all" || v === "unread" || v === "groups";
}

export function filterChatsByInboxTab(chats: Chat[], filter: ChatInboxFilterId, meId: ID): Chat[] {
  if (filter === "all") return chats;
  if (filter === "unread") return chats.filter(c => chatHasUnread(c, meId));
  return chats.filter(c => c.isGroup && !c.isChannel);
}

export function inboxFilterCounts(chats: Chat[], meId: ID): Record<ChatInboxFilterId, number> {
  let unread = 0;
  let groups = 0;
  for (const c of chats) {
    if (chatHasUnread(c, meId)) unread++;
    if (c.isGroup && !c.isChannel) groups++;
  }
  return { all: chats.length, unread, groups };
}
