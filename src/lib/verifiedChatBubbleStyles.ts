/** فقاعات رسائل مخصصة للموثّقين — أنيميشن CSS فقط (بدون فيديو/جسيمات) */
export type VerifiedChatBubbleStyleId =
  | "classic"
  | "fire"
  | "hearts"
  | "ocean"
  | "aurora"
  | "gold"
  | "neon"
  | "ice"
  | "rose";

export type VerifiedChatBubbleStyle = {
  id: VerifiedChatBubbleStyleId;
  labelAr: string;
  labelEn: string;
  /** فئة CSS واحدة على الفقاعة — بدون عناصر DOM إضافية */
  cssClass: string;
};

export const VERIFIED_CHAT_BUBBLE_STYLES: VerifiedChatBubbleStyle[] = [
  { id: "classic", labelAr: "كلاسيكي ✦", labelEn: "Classic", cssClass: "v-bubble-classic" },
  { id: "fire", labelAr: "نارية 🔥", labelEn: "Fire", cssClass: "v-bubble-fire" },
  { id: "hearts", labelAr: "قلوب وردية 💗", labelEn: "Hearts", cssClass: "v-bubble-hearts" },
  { id: "rose", labelAr: "وردي ناعم 🌸", labelEn: "Rose", cssClass: "v-bubble-rose" },
  { id: "ocean", labelAr: "محيط 🌊", labelEn: "Ocean", cssClass: "v-bubble-ocean" },
  { id: "aurora", labelAr: "شفق ✨", labelEn: "Aurora", cssClass: "v-bubble-aurora" },
  { id: "gold", labelAr: "ذهبي لامع", labelEn: "Gold", cssClass: "v-bubble-gold" },
  { id: "neon", labelAr: "نيون 💜", labelEn: "Neon", cssClass: "v-bubble-neon" },
  { id: "ice", labelAr: "جليد ❄️", labelEn: "Ice", cssClass: "v-bubble-ice" },
];

const VALID_IDS = new Set(VERIFIED_CHAT_BUBBLE_STYLES.map(s => s.id));

export function isVerifiedChatBubbleStyleId(v: unknown): v is VerifiedChatBubbleStyleId {
  return typeof v === "string" && VALID_IDS.has(v as VerifiedChatBubbleStyleId);
}

export function normalizeChatBubbleStyle(v: unknown): VerifiedChatBubbleStyleId {
  return isVerifiedChatBubbleStyleId(v) ? v : "classic";
}

export function getVerifiedChatBubbleStyle(id: unknown): VerifiedChatBubbleStyle {
  const norm = normalizeChatBubbleStyle(id);
  return VERIFIED_CHAT_BUBBLE_STYLES.find(s => s.id === norm) ?? VERIFIED_CHAT_BUBBLE_STYLES[0]!;
}

export function verifiedBubbleCssClass(id: unknown): string {
  return getVerifiedChatBubbleStyle(id).cssClass;
}

export function verifiedBubbleLabel(id: unknown, lang: string): string {
  const s = getVerifiedChatBubbleStyle(id);
  return lang === "en" ? s.labelEn : s.labelAr;
}
