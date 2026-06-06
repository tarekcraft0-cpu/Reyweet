import type { Chat } from "@/lib/types";
import { chatMergeKey } from "@/lib/dmChatId";

export type ChatWallpaperAnimationId =
  | "aurora"
  | "sakura"
  | "ocean"
  | "sunset"
  | "neon"
  | "forest"
  | "anime_sky"
  | "stars"
  | "cosmos"
  | "foliage"
  | "cherry_grove"
  | "rain"
  | "fireflies";

export type ChatWallpaperId =
  | "default"
  | "monstera"
  | "verified_gold"
  | "anim_aurora"
  | "anim_sakura"
  | "anim_ocean"
  | "anim_sunset"
  | "anim_neon"
  | "anim_forest"
  | "anim_anime_sky"
  | "anim_stars"
  | "anim_cosmos"
  | "anim_foliage"
  | "anim_cherry_grove"
  | "anim_rain"
  | "anim_fireflies";

export type ChatWallpaperTheme = {
  id: ChatWallpaperId;
  labelAr: string;
  labelEn: string;
  /** مسار تحت public (يُحلّ عبر BASE_URL) */
  imagePath?: string;
  /** طبقة تعتيم فوق الخلفية لقراءة الفقاعات */
  overlayOpacity?: number;
  /** خلفية متحركة CSS */
  animationId?: ChatWallpaperAnimationId;
  /** معاينة متدرجة في منتقي الثيم */
  previewGradient?: string;
};

export const CHAT_WALLPAPER_THEMES: ChatWallpaperTheme[] = [
  { id: "default", labelAr: "افتراضي", labelEn: "Default" },
  {
    id: "monstera",
    labelAr: "أوراق استوائية",
    labelEn: "Monstera",
    imagePath: "chat-themes/monstera.png",
    overlayOpacity: 0.38,
    previewGradient: "linear-gradient(135deg,#1a3d2e,#0d1f17)",
  },
  {
    id: "verified_gold",
    labelAr: "ذهبي موثّق ✦",
    labelEn: "Verified Gold",
    overlayOpacity: 0.42,
    previewGradient: "linear-gradient(135deg,#f59e0b,#0095F6,#FF2D55)",
  },
  {
    id: "anim_aurora",
    labelAr: "شفق قطبي ✨",
    labelEn: "Aurora",
    animationId: "aurora",
    overlayOpacity: 0.32,
    previewGradient: "linear-gradient(135deg,#0f172a,#312e81,#06b6d4)",
  },
  {
    id: "anim_sakura",
    labelAr: "ساكورا أنمي 🌸",
    labelEn: "Sakura",
    animationId: "sakura",
    overlayOpacity: 0.28,
    previewGradient: "linear-gradient(160deg,#fce7f3,#fda4af,#fbcfe8)",
  },
  {
    id: "anim_anime_sky",
    labelAr: "سماء أنمي ☁️",
    labelEn: "Anime Sky",
    animationId: "anime_sky",
    overlayOpacity: 0.25,
    previewGradient: "linear-gradient(180deg,#7dd3fc,#38bdf8,#1d4ed8)",
  },
  {
    id: "anim_ocean",
    labelAr: "محيط هادئ 🌊",
    labelEn: "Ocean",
    animationId: "ocean",
    overlayOpacity: 0.35,
    previewGradient: "linear-gradient(180deg,#0c4a6e,#0284c7,#06b6d4)",
  },
  {
    id: "anim_sunset",
    labelAr: "غروب طبيعي 🌅",
    labelEn: "Sunset",
    animationId: "sunset",
    overlayOpacity: 0.3,
    previewGradient: "linear-gradient(160deg,#7c2d12,#ea580c,#f472b6)",
  },
  {
    id: "anim_forest",
    labelAr: "غابة ضبابية 🌿",
    labelEn: "Forest",
    animationId: "forest",
    overlayOpacity: 0.38,
    previewGradient: "linear-gradient(180deg,#14532d,#166534,#052e16)",
  },
  {
    id: "anim_neon",
    labelAr: "نيون سايبر 💜",
    labelEn: "Neon",
    animationId: "neon",
    overlayOpacity: 0.4,
    previewGradient: "linear-gradient(135deg,#1e1b4b,#7c3aed,#ec4899)",
  },
  {
    id: "anim_stars",
    labelAr: "ليل مرصع ⭐",
    labelEn: "Starry Night",
    animationId: "stars",
    overlayOpacity: 0.45,
    previewGradient: "linear-gradient(180deg,#020617,#1e1b4b,#0f172a)",
  },
  {
    id: "anim_cosmos",
    labelAr: "كون عميق 🪐",
    labelEn: "Cosmos",
    animationId: "cosmos",
    overlayOpacity: 0.42,
    previewGradient: "radial-gradient(circle at 30% 20%,#4c1d95,#0f172a,#020617)",
  },
  {
    id: "anim_foliage",
    labelAr: "Foliage 🍃",
    labelEn: "Foliage",
    animationId: "foliage",
    overlayOpacity: 0.34,
    previewGradient: "linear-gradient(180deg,#365314,#4d7c0f,#14532d)",
  },
  {
    id: "anim_cherry_grove",
    labelAr: "كرز أنمي 🌸",
    labelEn: "Cherry Grove",
    animationId: "cherry_grove",
    overlayOpacity: 0.26,
    previewGradient: "linear-gradient(180deg,#fce7f3,#f9a8d4,#be185d)",
  },
  {
    id: "anim_rain",
    labelAr: "مطر هادئ 🌧️",
    labelEn: "Rain",
    animationId: "rain",
    overlayOpacity: 0.38,
    previewGradient: "linear-gradient(180deg,#334155,#475569,#1e293b)",
  },
  {
    id: "anim_fireflies",
    labelAr: "يراعات ليلية ✨",
    labelEn: "Fireflies",
    animationId: "fireflies",
    overlayOpacity: 0.4,
    previewGradient: "linear-gradient(180deg,#052e16,#14532d,#022c22)",
  },
];

/** ثيمات متاحة حسب الاشتراك */
export function chatWallpaperThemesForUser(hasExclusiveChatTheme: boolean): ChatWallpaperTheme[] {
  return CHAT_WALLPAPER_THEMES.filter(
    t => t.id !== "verified_gold" || hasExclusiveChatTheme,
  );
}

export function isAnimatedChatWallpaper(theme: ChatWallpaperTheme): boolean {
  return !!theme.animationId;
}

export function chatWallpaperUsesChrome(theme: ChatWallpaperTheme): boolean {
  return !!theme.imagePath || theme.id === "verified_gold" || isAnimatedChatWallpaper(theme);
}

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
