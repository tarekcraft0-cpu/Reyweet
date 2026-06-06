import type { ChatDmPalette } from "./chatDmTheme";
import {
  normalizeChatBubbleStyle,
  verifiedBubbleCssClass,
  type VerifiedChatBubbleStyleId,
} from "./verifiedChatBubbleStyles";

export type BubbleGroupPosition = "single" | "first" | "middle" | "last";

const R = 22;
const R_SM = 8;

/** زوايا الفقاعة حسب تجميع الرسائل المتتالية */
export function chatBubbleRadiusClasses(mine: boolean, group: BubbleGroupPosition, rtl: boolean): string {
  const tailEnd = mine ? (rtl ? "rounded-br-[6px]" : "rounded-bl-[6px]") : rtl ? "rounded-bl-[6px]" : "rounded-br-[6px]";
  const tailStart = mine ? (rtl ? "rounded-tr-[6px]" : "rounded-tl-[6px]") : rtl ? "rounded-tl-[6px]" : "rounded-tr-[6px]";

  if (group === "single") {
    return `rounded-[${R}px] ${tailEnd}`;
  }
  if (group === "first") {
    return mine
      ? `rounded-t-[${R}px] rounded-b-[${R_SM}px] ${rtl ? "rounded-bl-[6px] rounded-br-[6px]" : "rounded-bl-[6px] rounded-br-[6px]"} ${tailEnd}`
      : `rounded-t-[${R}px] rounded-b-[${R_SM}px] ${tailStart}`;
  }
  if (group === "middle") {
    return `rounded-[${R_SM}px]`;
  }
  return mine
    ? `rounded-b-[${R}px] rounded-t-[${R_SM}px] ${tailEnd}`
    : `rounded-b-[${R}px] rounded-t-[${R_SM}px] ${tailStart}`;
}

/** فئات Tailwind ثابتة (بدون قوالب ديناميكية — Tailwind لا يولّدها) */
export function chatBubbleRadiusTw(mine: boolean, group: BubbleGroupPosition, rtl: boolean): string {
  if (group === "single") {
    return mine
      ? rtl
        ? "rounded-[22px] rounded-br-[6px]"
        : "rounded-[22px] rounded-bl-[6px]"
      : rtl
        ? "rounded-[22px] rounded-bl-[6px]"
        : "rounded-[22px] rounded-br-[6px]";
  }
  if (group === "first") {
    return mine
      ? rtl
        ? "rounded-t-[22px] rounded-b-[8px] rounded-bl-[6px] rounded-br-[8px]"
        : "rounded-t-[22px] rounded-b-[8px] rounded-br-[6px] rounded-bl-[8px]"
      : rtl
        ? "rounded-t-[22px] rounded-b-[8px] rounded-tr-[6px] rounded-tl-[22px]"
        : "rounded-t-[22px] rounded-b-[8px] rounded-tl-[6px] rounded-tr-[22px]";
  }
  if (group === "middle") {
    return "rounded-[8px]";
  }
  return mine
    ? rtl
      ? "rounded-b-[22px] rounded-t-[8px] rounded-bl-[6px] rounded-br-[22px]"
      : "rounded-b-[22px] rounded-t-[8px] rounded-br-[6px] rounded-bl-[22px]"
    : rtl
      ? "rounded-b-[22px] rounded-t-[8px] rounded-tr-[6px] rounded-br-[22px]"
      : "rounded-b-[22px] rounded-t-[8px] rounded-tl-[6px] rounded-bl-[22px]";
}

export function chatBubbleDepthClass(
  verified: boolean,
  mine: boolean,
  bubbleStyle?: VerifiedChatBubbleStyleId | string | null,
): string {
  if (verified && mine) {
    const style = normalizeChatBubbleStyle(bubbleStyle);
    if (style !== "classic") return verifiedBubbleCssClass(style);
    return "v-bubble-classic";
  }
  if (verified && !mine) return "chat-bubble-verified-peer";
  return mine ? "chat-bubble-mine-depth" : "chat-bubble-peer-depth";
}

export function chatDmPeerBubbleStyleEnhanced(palette: ChatDmPalette, verified: boolean): {
  backgroundColor: string;
  color: string;
} {
  if (verified) {
    return {
      backgroundColor: "rgba(255,255,255,0.20)",
      color: palette.peerBubbleText,
    };
  }
  return {
    backgroundColor: palette.peerBubbleBg,
    color: palette.peerBubbleText,
  };
}
