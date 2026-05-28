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
