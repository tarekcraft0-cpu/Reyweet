/** تسجيل Service Worker لدعم PWA (Android + بعض ميزات iOS) */
export function registerPwa(): void {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  const base = import.meta.env.BASE_URL || "/app/";
  const swUrl = `${base.replace(/\/?$/, "/")}sw.js`;
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register(swUrl, { scope: base }).catch(() => {
      /* optional */
    });
  });
}
