/** حالة اتصال الخادم — للعمل المحلي عند انقطاع API */
let serverOnline = true;
let lastProbeAt = 0;

export function isServerReachable(): boolean {
  return serverOnline;
}

export function markServerOffline(): void {
  serverOnline = false;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("retweet-server-offline"));
  }
}

export function markServerOnline(): void {
  if (!serverOnline && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("retweet-server-online"));
  }
  serverOnline = true;
  lastProbeAt = Date.now();
}

export function serverLastProbedAt(): number {
  return lastProbeAt;
}

const TOKEN_KEY = "retweet_api_token";
const STATE_KEY = "retweet_state_v2";

export function hasPersistedLocalSession(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (localStorage.getItem(TOKEN_KEY)?.trim()) return true;
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { currentUserId?: string };
    const uid = parsed?.currentUserId?.trim();
    return !!uid && uid !== "guest" && !uid.startsWith("guest");
  } catch {
    return false;
  }
}
