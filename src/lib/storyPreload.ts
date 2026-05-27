/** تحميل مسبق لوسائط الستوري التالية */
export function preloadStoryUrls(urls: (string | undefined)[]): void {
  if (typeof window === "undefined") return;
  for (const raw of urls) {
    const u = raw?.trim();
    if (!u || u.startsWith("data:")) continue;
    const isVideo = /\.(mp4|webm|mov)(\?|$)/i.test(u) || u.includes("/videos/");
    if (isVideo) {
      const v = document.createElement("video");
      v.preload = "auto";
      v.muted = true;
      v.playsInline = true;
      v.src = u;
    } else {
      const img = new Image();
      img.decoding = "async";
      img.src = u;
    }
  }
}
