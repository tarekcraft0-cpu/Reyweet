import Constants from "expo-constants";

export type AndroidReleaseInfo = {
  version: string;
  versionCode: number;
  apkUrl: string;
  releasedAt?: string;
  notes?: string;
};

const DEFAULT_SITE = "https://reyweet.vercel.app";

export function getLocalAndroidVersionCode(): number {
  const fromAndroid = Constants.expoConfig?.android?.versionCode;
  if (typeof fromAndroid === "number" && fromAndroid > 0) return fromAndroid;
  const extra = Constants.expoConfig?.extra as { androidVersionCode?: number } | undefined;
  if (typeof extra?.androidVersionCode === "number") return extra.androidVersionCode;
  return 1;
}

export function getSiteBaseForUpdates(): string {
  const web = (Constants.expoConfig?.extra as { webAppUrl?: string } | undefined)?.webAppUrl || "";
  if (web.startsWith("http")) {
    try {
      const u = new URL(web);
      return `${u.protocol}//${u.host}`;
    } catch {
      /* ignore */
    }
  }
  return DEFAULT_SITE;
}

export async function fetchAndroidReleaseInfo(
  siteBase = getSiteBaseForUpdates(),
): Promise<AndroidReleaseInfo | null> {
  const base = siteBase.replace(/\/$/, "");
  const url = `${base}/downloads/android-version.json?t=${Date.now()}`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const j = (await res.json()) as AndroidReleaseInfo;
    if (!j?.apkUrl || !j.versionCode) return null;
    return j;
  } catch {
    return null;
  }
}

export function needsNativeApkUpdate(remote: AndroidReleaseInfo | null): boolean {
  if (!remote?.versionCode) return false;
  return remote.versionCode > getLocalAndroidVersionCode();
}
