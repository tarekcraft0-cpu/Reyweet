/** أرقام مختصرة بأسلوب إنستغرام: 10k، 1.5M، إلخ (لاحقة إنجليزية) */
export function formatCompactCount(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "0";
  if (n < 1000) return String(Math.floor(n));
  if (n < 1_000_000) {
    const k = n / 1000;
    const s = (Number.isInteger(k) ? k : Math.round(k * 10) / 10).toString();
    return s.replace(/\.0$/, "") + "k";
  }
  if (n < 1_000_000_000) {
    const m = n / 1_000_000;
    const s = (Number.isInteger(m) ? m : Math.round(m * 10) / 10).toString();
    return s.replace(/\.0$/, "") + "M";
  }
  const b = n / 1_000_000_000;
  const s = (Number.isInteger(b) ? b : Math.round(b * 10) / 10).toString();
  return s.replace(/\.0$/, "") + "B";
}
