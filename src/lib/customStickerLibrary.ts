import manifest from "../../spa/public/stickers/custom/manifest.json";

const VIDEO_STICKER_RE = /\.(mp4|webm|mov|m4v|ogg)(\?.*)?$/i;

/** مسار عام لملف داخل public/stickers/custom (يدعم أسماء عربية ومسافات) */
export function stickerPublicUrl(fileName: string): string {
  const base = (import.meta.env.BASE_URL || "/").replace(/\/?$/, "/");
  const name = fileName.replace(/^\/+/, "").replace(/^stickers\/custom\//i, "");
  return `${base}stickers/custom/${name.split("/").map(encodeURIComponent).join("/")}`;
}

let cached: { id: string; src: string }[] | null = null;

/** ملصقات تبويب «مخصص» — فقط الملفات التي وضعتها في public/stickers/custom */
export function getCustomStickerLibrary(): { id: string; src: string }[] {
  if (cached) return cached;
  const files = Array.isArray((manifest as { files?: string[] }).files)
    ? (manifest as { files: string[] }).files
    : [];
  cached = files.map((name, i) => ({
    id: `custom_${i}_${name}`,
    src: stickerPublicUrl(name),
  }));
  return cached;
}

export function isVideoStickerSrc(src: string): boolean {
  const value = src.trim().toLowerCase();
  return value.startsWith("data:video") || VIDEO_STICKER_RE.test(value);
}
