export function turnstileSiteKey(): string {
  return (
    process.env.TURNSTILE_SITE_KEY?.trim() ||
    process.env.VITE_TURNSTILE_SITE_KEY?.trim() ||
    ""
  );
}

export function turnstileConfigured(): boolean {
  return !!(process.env.TURNSTILE_SECRET_KEY?.trim() && turnstileSiteKey());
}

export async function verifyTurnstileToken(
  token: string | undefined,
  remoteIp?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) return { ok: true };
  const t = (token || "").trim();
  if (!t) return { ok: false, error: "أكمل التحقق البشري (CAPTCHA)" };

  const body = new URLSearchParams({
    secret,
    response: t,
  });
  if (remoteIp) body.set("remoteip", remoteIp);

  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const data = (await res.json().catch(() => ({}))) as { success?: boolean };
    if (!data.success) return { ok: false, error: "فشل التحقق البشري — حاول مرة أخرى" };
    return { ok: true };
  } catch {
    return { ok: false, error: "تعذر التحقق — حاول لاحقاً" };
  }
}

export function turnstileTokenFromBody(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const raw = (body as Record<string, unknown>).turnstileToken;
  return typeof raw === "string" ? raw.trim() : undefined;
}
