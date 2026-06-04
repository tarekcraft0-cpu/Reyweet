import { isNativeCapacitorShell } from "./apiUrlPolicy";

const BUILD_KEY = "retweet_app_build";
const FORCE_SERVER_KEY = "retweet_force_server_hydrate";

/** بعد ترقية APK/IPA — امسح لقطات قديمة واحتفظ بجلسات الدخول */
export function migrateNativeAppOnLaunch(): boolean {
  if (typeof window === "undefined" || !isNativeCapacitorShell()) return false;
  const build = (window as Window & { __RETWEET_APP_BUILD__?: string }).__RETWEET_APP_BUILD__?.trim();
  if (!build) return false;

  let prev: string | null = null;
  try {
    prev = localStorage.getItem(BUILD_KEY);
  } catch {
    return false;
  }
  if (!prev || prev === build) {
    try {
      localStorage.setItem(BUILD_KEY, build);
    } catch {
      /* ignore */
    }
    return false;
  }

  try {
    localStorage.removeItem("retweet_state_v2");
    localStorage.removeItem("retweet_web_api_config");
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (
        k.startsWith("retweet_account_state_") ||
        k.startsWith("retweet_chat_messages_") ||
        k.startsWith("retweet_chat_offline_queue_") ||
        k.startsWith("retweet_chat_draft_")
      ) {
        localStorage.removeItem(k);
      }
    }
    localStorage.setItem(BUILD_KEY, build);
    localStorage.setItem(FORCE_SERVER_KEY, "1");
  } catch {
    return false;
  }
  return true;
}

export function consumeForceServerHydrate(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (localStorage.getItem(FORCE_SERVER_KEY) !== "1") return false;
    localStorage.removeItem(FORCE_SERVER_KEY);
    return true;
  } catch {
    return false;
  }
}
