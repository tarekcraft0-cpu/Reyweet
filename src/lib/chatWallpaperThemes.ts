import type { Chat } from "@/lib/types";
import { chatMergeKey } from "@/lib/dmChatId";

export type ChatWallpaperId = "default" | "monstera";

export type ChatWallpaperTheme = {
  id: ChatWallpaperId;
  labelAr: string;
  labelEn: string;
  /** مسار تحت public (يُحلّ عبر BASE_URL) */
  imagePath?: string;
  /** طبقة تعتيم فوق الخلفية لقراءة الفقاعات */
  overlayOpacity?: number;
};

export const CHAT_WALLPAPER_THEMES: ChatWallpaperTheme[] = [
  { id: "default", labelAr: "افتراضي", labelEn: "Default" },
  {
    id: "monstera",
    labelAr: "أوراق استوائية",
    labelEn: "Monstera",
    imagePath: "chat-themes/monstera.png",
    overlayOpacity: 0.38,
  },
];

const STORAGE_KEY = "retweet_chat_wallpapers_v1";

function readMap(): Record<string, ChatWallpaperId> {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    const out: Record<string, ChatWallpaperId> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (CHAT_WALLPAPER_THEMES.some(t => t.id === v)) out[k] = v as ChatWallpaperId;
    }
    return out;
  } catch {
    return {};
  }
}

function writeMap(map: Record<string, ChatWallpaperId>): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore quota */
  }
}

export function getChatWallpaperTheme(id: ChatWallpaperId): ChatWallpaperTheme {
  return CHAT_WALLPAPER_THEMES.find(t => t.id === id) ?? CHAT_WALLPAPER_THEMES[0]!;
}

/** كل المفاتيح الممكنة لنفس المحادثة (id قديم + dm:…) */
export function chatWallpaperStorageKeys(chat: Chat, ownerId: string): string[] {
  const keys = new Set<string>();
  if (chat.id?.trim()) keys.add(chat.id.trim());
  if (ownerId) {
    const merge = chatMergeKey(chat, ownerId);
    if (merge) keys.add(merge);
  }
  return [...keys];
}

export function loadChatWallpaperId(chatKey: string): ChatWallpaperId {
  if (!chatKey) return "default";
  return readMap()[chatKey] ?? "default";
}

export function loadChatWallpaperForChat(chat: Chat, ownerId: string): ChatWallpaperId {
  const map = readMap();
  for (const key of chatWallpaperStorageKeys(chat, ownerId)) {
    const hit = map[key];
    if (hit) return hit;
  }
  return "default";
}

export function saveChatWallpaperId(chatKey: string, id: ChatWallpaperId): void {
  if (!chatKey) return;
  const map = readMap();
  if (id === "default") delete map[chatKey];
  else map[chatKey] = id;
  writeMap(map);
}

export function saveChatWallpaperForChat(chat: Chat, ownerId: string, id: ChatWallpaperId): void {
  const keys = chatWallpaperStorageKeys(chat, ownerId);
  if (keys.length === 0) return;
  const map = readMap();
  for (const key of keys) {
    if (id === "default") delete map[key];
    else map[key] = id;
  }
  writeMap(map);
}

export function chatWallpaperAssetUrl(imagePath: string): string {
  const base = (import.meta.env.BASE_URL as string | undefined) || "/app/";
  const normalized = base.endsWith("/") ? base : `${base}/`;
  return `${normalized}${imagePath.replace(/^\//, "")}`;
}

export function chatWallpaperLabel(theme: ChatWallpaperTheme, lang: string): string {
  return lang === "en" ? theme.labelEn : theme.labelAr;
}
