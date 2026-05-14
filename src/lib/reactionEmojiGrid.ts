import { PACK_ARABIC, PACK_CARTOON, PACK_ANIME } from "./stickerPacks";

function dedupeEmojis(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of items) {
    if (seen.has(e)) continue;
    seen.add(e);
    out.push(e);
  }
  return out;
}

/** شريط التفاعل السريع + قائمة موسّعة (نمط شبيه بإنستغرام) */
const QUICK_BAR = ["❤️", "😂", "😮", "😢", "😡", "👍"];

/** إيموجيات إضافية شائعة للتفاعل */
const EXTRA: string[] = [
  "🫶", "🫠", "🥹", "🫡", "🫢", "🫣", "🤌", "🫰", "🩷", "🩵", "💯", "✨", "🔥", "🙏", "👏", "🤝", "💪", "🤍", "🖤",
  "🎉", "🎊", "👀", "🤷", "🤦", "💀", "☠️", "🤡", "👻", "👽", "🤖", "💩", "🫵",
];

export const EXTENDED_REACTION_EMOJIS = dedupeEmojis([...QUICK_BAR, ...EXTRA, ...PACK_ARABIC, ...PACK_CARTOON, ...PACK_ANIME]);
