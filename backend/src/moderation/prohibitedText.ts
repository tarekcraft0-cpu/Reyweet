/** أنماط نصية — محتوى إباحي / عنيف / مخدرات / احتيال */
const EXPLICIT_PATTERNS: RegExp[] = [
  /\b(porn|porno|pornhub|xvideos|xvideo|xnxx|redtube|onlyfans|hentai|nude|nudes|nsfw|sexchat|sexcam)\b/i,
  /\b(اباحي|إباحي|اباحية|إباحية|سكس|سيكس|نيك|شرموط|قحب|عاهر|بورن|جنسي\s*صريح)\b/i,
  /\b(cocaine|heroin|meth|fentanyl|بيع\s*حشيش|مخدرات\s*للبيع)\b/i,
  /\b(kill\s*yourself|kys)\b/i,
  /(https?:\/\/[^\s]*?(pornhub|xvideos|xnxx|onlyfans)[^\s]*)/i,
];

const SUSPICIOUS_LINK_PATTERNS: RegExp[] = [
  /\b(t\.me\/|telegram\.me\/).*(bot|login|hack|free\s*followers)/i,
];

export type TextScanHit = { code: string; snippet: string };

export function scanProhibitedText(raw: string | undefined | null): TextScanHit | null {
  const text = (raw ?? "").trim();
  if (!text || text.length < 2) return null;
  const normalized = text.slice(0, 8000);
  for (const re of EXPLICIT_PATTERNS) {
    const m = normalized.match(re);
    if (m) return { code: "explicit_text", snippet: m[0].slice(0, 80) };
  }
  for (const re of SUSPICIOUS_LINK_PATTERNS) {
    const m = normalized.match(re);
    if (m) return { code: "suspicious_link", snippet: m[0].slice(0, 80) };
  }
  return null;
}
