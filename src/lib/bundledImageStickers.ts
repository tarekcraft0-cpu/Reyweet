/** ملصقات صور مربعة (SVG) — نفس فكرة الميم العربي؛ يمكنك إضافة PNG في `src/assets/stickers/` */

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function sqSticker(text: string, opts: { bg1?: string; bg2?: string; border?: string; textSize?: number } = {}) {
  const { bg1 = "#0f0f12", bg2 = "#1c1c24", border = "#3b82f6", textSize = 13 } = opts;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${bg1}"/><stop offset="100%" stop-color="${bg2}"/></linearGradient></defs><rect width="128" height="128" rx="14" fill="url(#bg)"/><rect x="5" y="5" width="118" height="118" rx="11" fill="none" stroke="${border}" stroke-width="3"/><text x="64" y="68" text-anchor="middle" fill="#f8fafc" font-size="${textSize}" font-family="Segoe UI,Tahoma,Arial,sans-serif">${esc(text)}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function pastelSticker(text: string, hue: number) {
  const border = `hsl(${hue} 70% 55%)`;
  const bg1 = `hsl(${hue} 35% 18%)`;
  const bg2 = `hsl(${hue} 25% 12%)`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><defs><linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${bg1}"/><stop offset="100%" stop-color="${bg2}"/></linearGradient></defs><rect width="128" height="128" rx="16" fill="url(#b)"/><rect x="6" y="6" width="116" height="116" rx="12" fill="none" stroke="${border}" stroke-width="4"/><text x="64" y="72" text-anchor="middle" fill="#fff" font-size="12" font-family="Segoe UI,Tahoma,sans-serif">${esc(text)}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** عربي — عبارات قصيرة بنمط الميم */
export const ARABIC_MEME_STICKERS: { id: string; src: string }[] = [
  { id: "ar1", src: sqSticker("رويدك أيها العبد") },
  { id: "ar2", src: sqSticker("سلامات يالعبد؟") },
  { id: "ar3", src: sqSticker("شوف العبد") },
  { id: "ar4", src: sqSticker("يا غالي صبر") },
  { id: "ar5", src: sqSticker("خلّك منه") },
  { id: "ar6", src: sqSticker("ما شاء الله") },
  { id: "ar7", src: sqSticker("طيب وش تقول؟") },
  { id: "ar8", src: sqSticker("الحين؟") },
  { id: "ar9", src: sqSticker("استغفر الله") },
  { id: "ar10", src: sqSticker("الله يهديك") },
  { id: "ar11", src: sqSticker("يا رجال كفى") },
  { id: "ar12", src: sqSticker("ضحكتني") },
  { id: "ar13", src: sqSticker("مدري والله") },
  { id: "ar14", src: sqSticker("يعني؟") },
  { id: "ar15", src: sqSticker("لا تعلّمني") },
  { id: "ar16", src: sqSticker("عاد يالطيب") },
  { id: "ar17", src: sqSticker("صج؟") },
  { id: "ar18", src: sqSticker("ماشي يا معلم") },
  { id: "ar19", src: sqSticker("خلاص انتهينا") },
  { id: "ar20", src: sqSticker("ياخي والله") },
  { id: "ar21", src: sqSticker("شكلي طفشت") },
  { id: "ar22", src: sqSticker("نمت ولا باقي؟") },
  { id: "ar23", src: sqSticker("يا بعد حيّي") },
  { id: "ar24", src: sqSticker("عساك على القوة") },
];

/** كرتون — ألوان زاهية */
export const CARTOON_MEME_STICKERS: { id: string; src: string }[] = [
  { id: "c1", src: pastelSticker("OK!", 200) },
  { id: "c2", src: pastelSticker("WOW", 280) },
  { id: "c3", src: pastelSticker("NOPE", 0) },
  { id: "c4", src: pastelSticker("LOL", 140) },
  { id: "c5", src: pastelSticker("BRUH", 40) },
  { id: "c6", src: pastelSticker("SAME", 320) },
  { id: "c7", src: pastelSticker("YAY!", 120) },
  { id: "c8", src: pastelSticker("HUH?", 260) },
  { id: "c9", src: pastelSticker("LATER", 220) },
  { id: "c10", src: pastelSticker("BYE", 340) },
  { id: "c11", src: pastelSticker("HI!", 180) },
  { id: "c12", src: pastelSticker("OMG", 300) },
  { id: "c13", src: pastelSticker("WIN", 100) },
  { id: "c14", src: pastelSticker("FAIL", 0) },
  { id: "c15", src: pastelSticker("WAIT", 200) },
  { id: "c16", src: pastelSticker("GO!", 160) },
];

/** أنمي — إطار داكن + لون بنفسجي/وردي */
export const ANIME_MEME_STICKERS: { id: string; src: string }[] = [
  { id: "a1", src: sqSticker("ガンバレ!", { border: "#a855f7", bg1: "#1a0a2e", bg2: "#2e1065", textSize: 15 }) },
  { id: "a2", src: sqSticker("かわいい", { border: "#ec4899", bg1: "#2a0a1a", bg2: "#500724", textSize: 14 }) },
  { id: "a3", src: sqSticker("やばい!", { border: "#f472b6", bg1: "#1f0f18", bg2: "#3b0d24", textSize: 14 }) },
  { id: "a4", src: sqSticker("本当？", { border: "#818cf8", bg1: "#0f172a", bg2: "#1e1b4b", textSize: 15 }) },
  { id: "a5", src: sqSticker("最高!", { border: "#38bdf8", bg1: "#0c1222", bg2: "#082f49", textSize: 14 }) },
  { id: "a6", src: sqSticker("うそ!", { border: "#fb7185", bg1: "#1a0a0f", bg2: "#450a0a", textSize: 14 }) },
  { id: "a7", src: sqSticker("感動", { border: "#c084fc", bg1: "#140822", bg2: "#2e1065", textSize: 14 }) },
  { id: "a8", src: sqSticker("ドキドキ", { border: "#f0abfc", bg1: "#1a0a18", bg2: "#4a044e", textSize: 12 }) },
  { id: "a9", src: sqSticker("笑", { border: "#34d399", bg1: "#052e16", bg2: "#064e3b", textSize: 22 }) },
  { id: "a10", src: sqSticker("泣", { border: "#60a5fa", bg1: "#0c1e3c", bg2: "#172554", textSize: 22 }) },
  { id: "a11", src: sqSticker("怒", { border: "#f87171", bg1: "#3b0a0a", bg2: "#450a0a", textSize: 22 }) },
  { id: "a12", src: sqSticker("愛", { border: "#fb7185", bg1: "#2a0a12", bg2: "#500724", textSize: 22 }) },
  { id: "a13", src: sqSticker("神", { border: "#fcd34d", bg1: "#1c1404", bg2: "#422006", textSize: 22 }) },
  { id: "a14", src: sqSticker("尊い", { border: "#e9d5ff", bg1: "#1a1025", bg2: "#3b0764", textSize: 13 }) },
  { id: "a15", src: sqSticker("推し", { border: "#fda4af", bg1: "#1a0a10", bg2: "#4c0519", textSize: 14 }) },
  { id: "a16", src: sqSticker("萌え", { border: "#fbcfe8", bg1: "#1a0a14", bg2: "#500724", textSize: 14 }) },
];

/** ملصقات PNG من المشروع (ضع ملفات في src/assets/stickers/*.png) */
export function loadUserStickerPngUrls(): { id: string; src: string }[] {
  try {
    const mods = import.meta.glob("../assets/stickers/*.png", {
      eager: true,
      query: "?url",
      import: "default",
    }) as Record<string, string>;
    return Object.entries(mods).map(([path, src], i) => ({ id: `png_${i}_${path}`, src }));
  } catch {
    return [];
  }
}

export type ImageStickerTab = "favorite" | "arabic" | "cartoon" | "anime" | "custom" | "emoji";

export const IMAGE_STICKER_TAB_LABELS: Record<ImageStickerTab, string> = {
  favorite: "مفضلة",
  arabic: "صور عربي",
  cartoon: "صور كرتون",
  anime: "صور أنمي",
  custom: "مخصص",
  emoji: "رموز",
};
