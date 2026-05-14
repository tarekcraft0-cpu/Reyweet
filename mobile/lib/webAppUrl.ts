import Constants from "expo-constants";

function normalize(raw: string | undefined): string {
  if (raw == null) return "";
  let s = raw.replace(/^\uFEFF/, "").replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }
  return s.replace(/\/+$/, "");
}

/** عنوان تطبيق الويب (Vite) كما يفتحه المتصفح على الشبكة — نفس منطق `src/`. */
export function getWebAppUrl(): string {
  const fromEnv = normalize(process.env.EXPO_PUBLIC_WEB_APP_URL);
  if (fromEnv) return fromEnv;
  const extra = Constants.expoConfig?.extra as { webAppUrl?: string } | undefined;
  return normalize(extra?.webAppUrl);
}
