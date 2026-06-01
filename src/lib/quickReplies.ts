import type { ID } from "./types";

const KEY = "retweet-quick-replies";

export type QuickReplyTemplate = { id: ID; text: string };

export function loadQuickReplies(userId: ID): QuickReplyTemplate[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(`${KEY}:${userId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as QuickReplyTemplate[];
    return Array.isArray(parsed)
      ? parsed.filter(x => x && typeof x.text === "string").slice(0, 20)
      : [];
  } catch {
    return [];
  }
}

export function saveQuickReplies(userId: ID, items: QuickReplyTemplate[]): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(`${KEY}:${userId}`, JSON.stringify(items.slice(0, 20)));
}

export const DEFAULT_QUICK_REPLIES_AR: string[] = [
  "شكراً لك 🙏",
  "سأرد عليك قريباً",
  "موافق ✅",
];
