function cleanPath(content: string) {
  return content.toLowerCase().split("?")[0].split("#")[0];
}

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|svg|avif)$/i;
const VIDEO_EXT_RE = /\.(mp4|webm|mov|m4v|ogg)$/i;

export function isStickerVideoContent(content: string) {
  const raw = (content ?? "").trim();
  if (!raw) return false;
  if (raw.startsWith("data:video")) return true;
  return VIDEO_EXT_RE.test(cleanPath(raw));
}

/** ملصق كصورة (وليس إيموجي نصي) */
export function isStickerImageContent(content: string) {
  const raw = (content ?? "").trim();
  if (!raw || isStickerVideoContent(raw)) return false;
  if (raw.startsWith("data:image")) return true;
  return IMAGE_EXT_RE.test(cleanPath(raw));
}
