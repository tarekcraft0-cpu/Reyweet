export const VOICE_WAVE_BARS = 40;

/** لا تستخدم `hidden` — على iOS قد لا يُشغَّل صوت/فيديو الرسالة الصوتية */
export const VOICE_MEDIA_OFFSCREEN =
  "pointer-events-none fixed start-0 top-0 z-[-1] m-0 h-[2px] w-[2px] max-h-[2px] max-w-[2px] overflow-hidden border-0 p-0 opacity-[0.02]";

export function voiceWaveHeightsFromSrc(src: string): number[] {
  let h = 0;
  for (let i = 0; i < src.length; i++) h = (h + src.charCodeAt(i) * (i + 1)) % 100017;
  return Array.from({ length: VOICE_WAVE_BARS }, (_, i) => {
    const t = Math.sin((i + 1) * 1.55 + h * 0.00012) * 0.45 + 0.55;
    const t2 = Math.cos((i + 2) * 0.9 + h * 0.00008) * 0.2;
    return Math.round(Math.min(100, Math.max(28, (t + t2) * 100)));
  });
}

/** Safari/iOS غالباً لا يشغّل webm صوت — نستخدم عنصر فيديو مخفي */
export function voiceUsesVideoElement(src: string): boolean {
  if (src.startsWith("data:video")) return true;
  const low = src.slice(0, 120).toLowerCase();
  return low.includes("audio/webm") || low.includes("video/webm");
}

export function waitVoiceMediaCanPlay(el: HTMLMediaElement): Promise<void> {
  if (el.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const done = () => {
      cleanup();
      resolve();
    };
    const fail = () => {
      cleanup();
      reject(new Error("media load failed"));
    };
    const cleanup = () => {
      el.removeEventListener("canplay", done);
      el.removeEventListener("loadeddata", done);
      el.removeEventListener("error", fail);
    };
    el.addEventListener("canplay", done, { once: true });
    el.addEventListener("loadeddata", done, { once: true });
    el.addEventListener("error", fail, { once: true });
    try {
      el.load();
    } catch {
      /* ignore */
    }
  });
}

export function fmtVoiceTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

/** مقطع صوتي قد يكون webm أو فيديو قصير (مكتبة iOS) */
export function isVoicePlaybackVideoSrc(src: string): boolean {
  if (!src?.trim()) return false;
  const t = src.trim();
  if (t.startsWith("data:video")) return true;
  if (t.startsWith("data:video/")) return true;
  if (/\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(t)) return true;
  if (t.includes("/media/videos/")) return true;
  const low = t.slice(0, 120).toLowerCase();
  return low.includes("audio/webm") || low.includes("video/webm");
}

export function isVoiceAttachFile(file: File): boolean {
  return file.type.startsWith("audio/") || file.type.startsWith("video/");
}
