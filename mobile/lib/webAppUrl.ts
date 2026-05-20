import Constants from "expo-constants";
import { NativeModules } from "react-native";

const DEFAULT_WEB_DEV_PORT = 3077;

function normalize(raw: string | undefined): string {
  if (raw == null) return "";
  let s = raw.replace(/^\uFEFF/, "").replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }
  return s.replace(/\/+$/, "");
}

function getConfiguredWebDevPort(): number {
  const extra = Constants.expoConfig?.extra as { webDevPort?: number; webAppUrl?: string } | undefined;
  const p = extra?.webDevPort;
  return typeof p === "number" && p > 0 && p < 65536 ? p : DEFAULT_WEB_DEV_PORT;
}

/** شبكة خاصة أو محاكي (لتجنّب استخدام نطاقات exp/ngrok كـ «LAN»). */
function isLikelyLanOrEmulatorIpv4(hostname: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

/**
 * في Expo Go يكون عنوان حزمة JS (Metro) على نفس IP الذي يجب أن يخدمه Vite على المنفذ 3077.
 * يُفضَّل على ‎EXPO_PUBLIC_WEB_APP_URL‎ اليدوي لأنّه يزيل خطأ IP القديم بعد تغيّر الشبكة.
 */
function inferDevWebAppUrlFromExpo(): string {
  const port = getConfiguredWebDevPort();
  const scriptURL = (NativeModules as { SourceCode?: { scriptURL?: string } }).SourceCode?.scriptURL;
  if (typeof scriptURL === "string" && scriptURL.startsWith("http")) {
    try {
      const u = new URL(scriptURL);
      const h = u.hostname;
      if (h === "localhost" || h === "127.0.0.1") return `http://${h}:${port}`;
      if (isLikelyLanOrEmulatorIpv4(h)) return `http://${h}:${port}`;
    } catch {
      /* ignore */
    }
  }
  const hostUri = Constants.expoConfig?.hostUri;
  if (typeof hostUri === "string" && hostUri.length > 0) {
    const base = hostUri.split("?")[0] ?? hostUri;
    const colon = base.lastIndexOf(":");
    const h = (colon > 0 ? base.slice(0, colon) : base).trim();
    if (h && h !== "localhost" && h !== "127.0.0.1" && isLikelyLanOrEmulatorIpv4(h)) {
      return `http://${h}:${port}`;
    }
  }
  return "";
}

/** عنوان تطبيق الويب (Vite) كما يفتحه المتصفح على الشبكة — نفس منطق `src/`. */
export function getWebAppUrl(): string {
  const fromEnv = normalize(process.env.EXPO_PUBLIC_WEB_APP_URL);
  const strictEnv = normalize(process.env.EXPO_PUBLIC_WEB_APP_URL_STRICT) === "1";
  const inferred =
    typeof __DEV__ !== "undefined" && __DEV__ && !strictEnv ? inferDevWebAppUrlFromExpo() : "";

  if (strictEnv && fromEnv) return fromEnv;

  if (inferred) {
    if (fromEnv && fromEnv !== inferred && typeof console !== "undefined" && console.warn) {
      console.warn(
        `[retweet-mobile] استخدام عنوان الويب المستنتج (${inferred}) بدلاً من EXPO_PUBLIC_WEB_APP_URL (${fromEnv}). لإجبار .env عيّن EXPO_PUBLIC_WEB_APP_URL_STRICT=1.`,
      );
    }
    return inferred;
  }

  if (fromEnv) return fromEnv;
  const extra = Constants.expoConfig?.extra as { webAppUrl?: string; webDevPort?: number } | undefined;
  const fromExtra = normalize(extra?.webAppUrl);
  if (fromExtra) return fromExtra;
  return "";
}
