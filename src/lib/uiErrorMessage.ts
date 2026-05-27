/** ترجمة رسائل React/Vite الشائعة إلى عربي للمستخدم */
export function describeUiError(error: Error | null | undefined): string {
  if (!error?.message) {
    return "حدث خطأ غير متوقع في الواجهة.";
  }
  const msg = error.message;
  const lower = msg.toLowerCase();

  if (lower.includes("useapp must be used within appprovider")) {
    return "تعذّر تحميل التطبيق (سياق الحالة مفقود). حدّث الصفحة أو امسح بيانات الموقع ثم سجّل الدخول من جديد.";
  }
  if (lower.includes("rendered more hooks") || lower.includes("rendered fewer hooks") || msg.includes("#310")) {
    return "خطأ داخلي في الواجهة بعد تسجيل الدخول. حدّث الصفحة (F5) — إن استمر، امسح بيانات الموقع المحلية.";
  }
  if (lower.includes("cannot read properties of undefined") || lower.includes("cannot read property")) {
    return "بيانات الحساب أو المنشورات غير مكتملة من الخادم. جرّب التحديث أو إعادة تسجيل الدخول.";
  }
  if (lower.includes("failed to fetch") || lower.includes("networkerror") || lower.includes("load failed")) {
    return "تعذّر الاتصال بالخادم. تأكد أن الخادم يعمل أو أن عنوان API صحيح.";
  }
  if (lower.includes("missing #root")) {
    return "تعذّر عرض التطبيق (عنصر الصفحة مفقود).";
  }
  if (/^minified react error/i.test(msg)) {
    return "خطأ في عرض الواجهة. حدّث الصفحة أو امسح التخزين المحلي ثم أعد تسجيل الدخول.";
  }

  return "حدث خطأ في الواجهة. جرّب تحديث الصفحة.";
}

export function clearRetweetLocalSession(): void {
  if (typeof window === "undefined") return;
  try {
    const keys = [
      "retweet_state_v2",
      "retweet_api_token",
      "retweet_account_sessions_v1",
      "retweet_web_api_config",
    ];
    for (const k of keys) localStorage.removeItem(k);
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k?.startsWith("retweet_account_state_")) localStorage.removeItem(k);
    }
  } catch {
    /* ignore */
  }
  void import("./remotePushGate").then(m => m.resetServerHydrated());
}
