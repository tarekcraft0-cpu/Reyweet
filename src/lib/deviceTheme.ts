/** ثيم الجهاز — مشترك بين كل الحسابات على نفس المتصفح/التطبيق */
const THEME_KEY = "retweet_device_theme";

export type DeviceTheme = "light" | "dark";

export function readDeviceTheme(): DeviceTheme {
  if (typeof window === "undefined") return "light";
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v === "dark" || v === "light") return v;
  } catch {
    /* ignore */
  }
  return "light";
}

export function writeDeviceTheme(theme: DeviceTheme): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* ignore */
  }
  applyDeviceThemeToDom(theme);
}

export function applyDeviceThemeToDom(theme: DeviceTheme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (theme === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
}
