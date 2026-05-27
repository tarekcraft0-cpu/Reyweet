import type { Message } from "@/lib/types";

/** وضع التطبيق العام (ليس ثيم الألوان داخل المحادثة القديم blue/pink) */
export type ChatDmAppTheme = "light" | "dark";

/** Monochrome Liquid Glass — رسائلي بيضاء ناصعة */
export const CHAT_DM_MINE_BUBBLE = "#ffffff";
export const CHAT_DM_ACCENT = CHAT_DM_MINE_BUBBLE;
export const CHAT_DM_MINE_TIME_DARK = "rgba(0,0,0,0.50)";
export const CHAT_DM_MINE_TIME_LIGHT = "rgba(0,0,0,0.40)";

export type ChatDmPalette = {
  surface: string;
  composerField: string;
  peerBubbleBg: string;
  peerBubbleText: string;
  mineTime: string;
  dayPillBg: string;
  dayPillText: string;
  peerTime: string;
  headerTitleClass: string;
  headerSubClass: string;
  iconBtnClass: string;
  composerTextClass: string;
  composerPlaceholderClass: string;
  composerIconClass: string;
  menuPanelClass: string;
  menuItemHoverClass: string;
  attachMenuClass: string;
  attachMenuItemClass: string;
};

const PALETTES: Record<ChatDmAppTheme, ChatDmPalette> = {
  /** ═══ Glassmorphism / Apple Liquid Glass — Dark (Monochrome) ═══ */
  dark: {
    surface: "#000000",
    composerField: "rgba(255,255,255,0.09)",
    peerBubbleBg: "rgba(255,255,255,0.10)",
    peerBubbleText: "#ffffff",
    mineTime: "rgba(0,0,0,0.55)",
    dayPillBg: "rgba(255,255,255,0.10)",
    dayPillText: "rgba(255,255,255,0.55)",
    peerTime: "rgba(255,255,255,0.40)",
    headerTitleClass: "text-white",
    headerSubClass: "text-white/50",
    iconBtnClass: "text-white/80 hover:bg-white/10 active:bg-white/15 transition-colors duration-150",
    composerTextClass: "text-white caret-white",
    composerPlaceholderClass: "placeholder:text-white/35",
    composerIconClass: "text-white/60 hover:bg-white/10 transition-colors duration-150",
    menuPanelClass: "border-white/10 bg-white/10 backdrop-blur-2xl text-white shadow-2xl",
    menuItemHoverClass: "hover:bg-white/10",
    attachMenuClass: "border-white/10 bg-white/10 backdrop-blur-2xl shadow-2xl",
    attachMenuItemClass: "text-white hover:bg-white/10",
  },
  /** ═══ Glassmorphism / Apple Liquid Glass — Light (Monochrome) ═══ */
  light: {
    surface: "#f2f2f7",
    composerField: "rgba(0,0,0,0.06)",
    peerBubbleBg: "rgba(0,0,0,0.07)",
    peerBubbleText: "#000000",
    mineTime: "rgba(255,255,255,0.70)",
    dayPillBg: "rgba(0,0,0,0.06)",
    dayPillText: "rgba(0,0,0,0.45)",
    peerTime: "rgba(0,0,0,0.38)",
    headerTitleClass: "text-black",
    headerSubClass: "text-black/45",
    iconBtnClass: "text-black/70 hover:bg-black/[0.07] active:bg-black/10 transition-colors duration-150",
    composerTextClass: "text-black caret-black",
    composerPlaceholderClass: "placeholder:text-black/35",
    composerIconClass: "text-black/50 hover:bg-black/[0.06] transition-colors duration-150",
    menuPanelClass: "border-black/8 bg-white/70 backdrop-blur-2xl text-black shadow-2xl",
    menuItemHoverClass: "hover:bg-black/5",
    attachMenuClass: "border-black/8 bg-white/70 backdrop-blur-2xl shadow-2xl",
    attachMenuItemClass: "text-black hover:bg-black/5",
  },
};

export function resolveChatDmAppTheme(appTheme: string | undefined): ChatDmAppTheme {
  return appTheme === "dark" ? "dark" : "light";
}

export function getChatDmPalette(appTheme: string | undefined): ChatDmPalette {
  return PALETTES[resolveChatDmAppTheme(appTheme)];
}

/** @deprecated استخدم getChatDmPalette — للتوافق */
export const CHAT_DM_BG = "#000000";
export const CHAT_DM_CHROME = CHAT_DM_BG;

export function isIgDmChat(isDmRoom: boolean, isQuranChannel: boolean): boolean {
  return isDmRoom && !isQuranChannel;
}

export function chatDmLayoutDir(lang: string): "ltr" | "rtl" {
  return lang === "ar" ? "rtl" : "ltr";
}

export function chatDmIsRtl(lang: string): boolean {
  return lang === "ar";
}

export function chatBubbleAlignClasses(mine: boolean): string {
  return mine ? "items-end self-end" : "items-start self-start";
}

export function chatReactionAlignClasses(mine: boolean): string {
  return mine ? "self-end pe-1" : "self-start ps-1";
}

export function chatDmPeerBubbleStyle(palette: ChatDmPalette): {
  backgroundColor: string;
  color: string;
} {
  return { backgroundColor: palette.peerBubbleBg, color: palette.peerBubbleText };
}

export function formatChatBubbleTime(createdAt: number, lang: string): string {
  try {
    return new Date(createdAt).toLocaleTimeString(lang === "en" ? "en-US" : "ar-SA", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return "";
  }
}

function dayStart(ts: number): number {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function chatDayDividerLabel(createdAt: number, lang: string): string {
  const now = Date.now();
  const msgDay = dayStart(createdAt);
  const today = dayStart(now);
  const yesterday = today - 86_400_000;
  if (msgDay >= today) return lang === "en" ? "Today" : "اليوم";
  if (msgDay >= yesterday) return lang === "en" ? "Yesterday" : "أمس";
  try {
    return new Date(createdAt).toLocaleDateString(lang === "en" ? "en-US" : "ar-SA", {
      weekday: "long",
      day: "numeric",
      month: "short",
    });
  } catch {
    return lang === "en" ? "Earlier" : "سابقاً";
  }
}

export type ChatTimelineRow =
  | { kind: "day"; key: string; label: string }
  | { kind: "message"; key: string; message: Message; showPeerAvatar: boolean };

export function buildChatTimelineRows(
  messages: Message[],
  meId: string,
  lang: string,
): ChatTimelineRow[] {
  const rows: ChatTimelineRow[] = [];
  let lastDay = "";
  let lastPeerSender = "";

  for (const m of messages) {
    const dayKey = String(dayStart(m.createdAt));
    if (dayKey !== lastDay) {
      lastDay = dayKey;
      lastPeerSender = "";
      rows.push({
        kind: "day",
        key: `day-${dayKey}`,
        label: chatDayDividerLabel(m.createdAt, lang),
      });
    }

    const mine = m.senderId === meId;
    if (mine) {
      lastPeerSender = "";
      rows.push({ kind: "message", key: m.id, message: m, showPeerAvatar: false });
    } else {
      const showPeerAvatar = m.senderId !== lastPeerSender;
      lastPeerSender = m.senderId;
      rows.push({ kind: "message", key: m.id, message: m, showPeerAvatar });
    }
  }

  return rows;
}
