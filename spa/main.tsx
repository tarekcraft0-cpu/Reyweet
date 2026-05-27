import { createRoot } from "react-dom/client";
import { applyDeviceThemeToDom, readDeviceTheme } from "@/lib/deviceTheme";
import { WebAppRoot } from "@/spa/WebAppRoot";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import { registerPwa } from "@/lib/registerPwa";
import { warmGlobalPointerBackRouter } from "@/lib/globalPointerBackRouter";
import "@/styles.css";

warmGlobalPointerBackRouter();
registerPwa();
applyDeviceThemeToDom(readDeviceTheme());

if (typeof window !== "undefined") {
  const showBootError = (title: string, detail: string) => {
    const el = document.getElementById("root");
    if (!el || el.childElementCount > 0) return;
    el.innerHTML = `<div dir="rtl" lang="ar" style="font-family:system-ui;padding:1.5rem;max-width:28rem;margin:0 auto;min-height:100dvh;display:flex;flex-direction:column;justify-content:center;gap:0.75rem"><p style="font-weight:600">${title}</p><pre style="font-size:11px;white-space:pre-wrap;word-break:break-word;background:#f4f4f5;padding:0.75rem;border-radius:12px;max-height:40vh;overflow:auto">${detail.replace(/</g, "&lt;")}</pre><button type="button" onclick="location.reload()" style="padding:0.75rem 1rem;border-radius:12px;border:none;background:#111;color:#fff;font-weight:600">تحديث</button></div>`;
  };
  window.addEventListener("error", ev => {
    console.error("[Retweet] uncaught:", ev.error ?? ev.message);
    showBootError("خطأ قبل تحميل الواجهة", String(ev.error?.stack ?? ev.message ?? ev));
  });
  window.addEventListener("unhandledrejection", ev => {
    console.error("[Retweet] unhandled rejection:", ev.reason);
    const r = ev.reason;
    showBootError("خطأ غير معالج", String(r?.stack ?? r?.message ?? r));
  });
}

const el = document.getElementById("root");
if (!el) {
  document.body.innerHTML =
    '<div dir="rtl" lang="ar" style="font-family:system-ui;padding:2rem;text-align:center"><h1>تعذّر تحميل التطبيق</h1><p>عنصر الصفحة غير موجود.</p></div>';
} else {
  createRoot(el).render(
    <AppErrorBoundary>
      <WebAppRoot />
    </AppErrorBoundary>,
  );
}
