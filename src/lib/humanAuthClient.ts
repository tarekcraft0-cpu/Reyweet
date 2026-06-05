import { apiFetch, ensureApiRuntimeConfig, getApiBaseUrl } from "./apiBackend";
import { isNativeCapacitorShell } from "./apiUrlPolicy";

let cachedChallengeId: string | null = null;
let cachedAt = 0;
const CHALLENGE_TTL_MS = 6 * 60 * 1000;

export type AuthHumanExtras = {
  humanChallengeId?: string;
  turnstileToken?: string;
  _hp?: string;
};

/** جلب تحدي بشري من الخادم — يُستهلك مرة واحدة لكل محاولة دخول/تسجيل */
export async function refreshHumanChallenge(): Promise<string | null> {
  await ensureApiRuntimeConfig();
  if (!getApiBaseUrl() && typeof window === "undefined") return null;
  try {
    const res = await apiFetch("/auth/human-challenge", { method: "GET", token: null });
    const data = (await res.json().catch(() => ({}))) as { challengeId?: string };
    if (!res.ok || !data.challengeId) return null;
    cachedChallengeId = data.challengeId;
    cachedAt = Date.now();
    return data.challengeId;
  } catch {
    return null;
  }
}

export async function getHumanChallengeId(): Promise<string | null> {
  if (cachedChallengeId && Date.now() - cachedAt < CHALLENGE_TTL_MS) return cachedChallengeId;
  return refreshHumanChallenge();
}

export async function buildAuthHumanBody(
  base: Record<string, unknown>,
  turnstileToken?: string | null,
): Promise<Record<string, unknown>> {
  const humanChallengeId = await getHumanChallengeId();
  return {
    ...base,
    humanChallengeId: humanChallengeId || undefined,
    turnstileToken: turnstileToken?.trim() || undefined,
    _hp: "",
  };
}

export function nativeClientHeader(): Record<string, string> {
  if (isNativeCapacitorShell()) return { "X-Retweet-Client": "native" };
  return {};
}
