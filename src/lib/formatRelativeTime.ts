/** وقت نسبي للمنشورات (عربي / إنجليزي) */
export function formatRelativeTime(createdAt: number, lang: "ar" | "en" = "ar"): string {
  const sec = Math.max(0, Math.floor((Date.now() - createdAt) / 1000));
  if (lang === "en") {
    if (sec < 60) return "just now";
    const m = Math.floor(sec / 60);
    if (m < 60) return m === 1 ? "1 min ago" : `${m} min ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return h === 1 ? "1 hour ago" : `${h} hours ago`;
    const d = Math.floor(h / 24);
    if (d < 7) return d === 1 ? "1 day ago" : `${d} days ago`;
    const w = Math.floor(d / 7);
    if (w < 5) return w === 1 ? "1 week ago" : `${w} weeks ago`;
    const mo = Math.floor(d / 30);
    if (mo < 12) return mo <= 1 ? "1 month ago" : `${mo} months ago`;
    const y = Math.floor(d / 365);
    return y <= 1 ? "1 year ago" : `${y} years ago`;
  }
  if (sec < 45) return "الآن";
  if (sec < 90) return "منذ دقيقة";
  const m = Math.floor(sec / 60);
  if (m < 60) return m === 1 ? "منذ دقيقة" : `منذ ${m} دقائق`;
  const h = Math.floor(m / 60);
  if (h < 24) return h === 1 ? "منذ ساعة" : `منذ ${h} ساعات`;
  const d = Math.floor(h / 24);
  if (d === 1) return "منذ يوم";
  if (d < 7) return `منذ ${d} أيام`;
  const w = Math.floor(d / 7);
  if (w === 1) return "منذ أسبوع";
  if (w < 5) return `منذ ${w} أسابيع`;
  const mo = Math.floor(d / 30);
  if (mo <= 1) return "منذ شهر";
  if (mo < 12) return `منذ ${mo} أشهر`;
  const y = Math.floor(d / 365);
  return y <= 1 ? "منذ سنة" : `منذ ${y} سنوات`;
}
