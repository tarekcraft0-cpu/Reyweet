/** يوحّد روابط الميديا للعميل — مسار نسبي /media/... يُحلّ على الواجهة بعنوان API الحالي */
export function toClientMediaRef(value: string | undefined | null): string {
  const v = (value ?? "").trim();
  if (!v) return "";
  if (v.startsWith("data:") || v.startsWith("blob:")) return v;
  if (v.length <= 4 && !v.startsWith("/") && !/^https?:\/\//i.test(v)) return v;

  const pathMatch = v.match(/(\/media\/(?:images|videos)\/[^\s?#"']+)/i);
  if (pathMatch) return pathMatch[1];

  if (v.startsWith("/media/")) return v.split("?")[0] ?? v;

  return v;
}

function rewriteValue(value: unknown): unknown {
  if (typeof value === "string") return toClientMediaRef(value);
  if (Array.isArray(value)) return value.map(rewriteValue);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = rewriteValue(v);
    }
    return out;
  }
  return value;
}

/** يمرّ على حقول الحالة التي قد تحتوي روابط ميديا قديمة (نفق/localhost) */
export function rewriteAppStateMediaRefs<T>(state: T): T {
  return rewriteValue(state) as T;
}
