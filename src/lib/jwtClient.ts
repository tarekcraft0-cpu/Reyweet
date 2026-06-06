/** استخراج معرّف المستخدم من JWT (بدون تحقق — للاستعادة المحلية فقط). */
export function decodeJwtSub(token: string | null | undefined): string | null {
  if (!token) return null;
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 ? "=".repeat(4 - (b64.length % 4)) : "";
    const json = JSON.parse(atob(b64 + pad)) as { sub?: string; userId?: string };
    const id = json.sub || json.userId;
    return typeof id === "string" && id.length > 0 ? id : null;
  } catch {
    return null;
  }
}
