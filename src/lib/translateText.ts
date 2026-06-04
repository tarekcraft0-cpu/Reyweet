export type TranslateTarget = "ar" | "en" | "auto";

function hasArabicScript(text: string): boolean {
  return /[\u0600-\u06FF]/.test(text);
}

function resolveLangPair(text: string, target: TranslateTarget): string {
  const ar = hasArabicScript(text);
  if (target === "ar") return ar ? "ar|ar" : "en|ar";
  if (target === "en") return ar ? "ar|en" : "en|en";
  return ar ? "ar|en" : "en|ar";
}

export type TranslateResult =
  | { ok: true; text: string; targetLang: "ar" | "en" }
  | { ok: false; error: string };

/** ترجمة خفيفة عبر MyMemory (بدون مفتاح) — للرسائل والمنشورات القصيرة */
export async function translateText(
  raw: string,
  target: TranslateTarget = "auto",
): Promise<TranslateResult> {
  const text = raw.trim().slice(0, 500);
  if (!text) return { ok: false, error: "لا يوجد نص للترجمة" };
  const langpair = resolveLangPair(text, target);
  const targetLang: "ar" | "en" = langpair.endsWith("|ar") ? "ar" : "en";
  try {
    const qs = new URLSearchParams({ q: text, langpair });
    const res = await fetch(
      `https://api.mymemory.translated.net/get?${qs}`,
      { method: "GET", cache: "no-store" },
    );
    if (!res.ok) return { ok: false, error: "تعذر الاتصال بخدمة الترجمة" };
    const data = (await res.json()) as {
      responseStatus?: number;
      responseData?: { translatedText?: string };
    };
    const out = data.responseData?.translatedText?.trim();
    if (!out || data.responseStatus === 403) {
      return { ok: false, error: "الترجمة غير متاحة حالياً — حاول لاحقاً" };
    }
    return { ok: true, text: out, targetLang };
  } catch {
    return { ok: false, error: "تحقق من الإنترنت ثم أعد المحاولة" };
  }
}
