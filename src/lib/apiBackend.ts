import { Capacitor } from "@capacitor/core";
import { isolateUsersForAccountCache, snapshotAccountIdsForOwner } from "./accountSessions";
import type { AppState, Chat, ID, Message, User } from "./types";
import {
  defaultDevApiUrl,
  ensureApiRuntimeConfig,
  peekApiBaseUrl,
  useViteDevProxy,
} from "./apiConfig";
import { isPublicAppHost, isVpsProductionHost } from "./apiUrlPolicy";
import { isGuestUserId } from "./guestUser";
import { scopeAppStateToAccount } from "./scopeAppState";
import { isReactNativeWebView } from "./nativeShell";

const TOKEN_KEY = "retweet_api_token";

/** عنوان الخادم: عيّن VITE_API_URL و VITE_API_URL_MOBILE إلى http://<IPv4-الكمبيوتر>:8788 لنفس شبكة الـ Wi‑Fi (الآيفون لا يصل إلى localhost للكمبيوتر). */
export function getApiBaseUrl(): string {
  const fromPeek = peekApiBaseUrl();

  let raw = "";
  try {
    const useMobileBase =
      Capacitor.isNativePlatform() ||
      (typeof window !== "undefined" && isReactNativeWebView());
    if (useMobileBase) {
      raw =
        (import.meta.env.VITE_API_URL_MOBILE as string | undefined)?.trim() ||
        (import.meta.env.VITE_API_URL as string | undefined)?.trim() ||
        "";
    }
  } catch {
    /* ignore */
  }
  return (raw.replace(/\/$/, "") || fromPeek).replace(/\/$/, "");
}

/** اتصال فعلي بخادم Retweet API (نفق / LAN / بروكسي التطوير) */
export function hasApiBackendConnection(): boolean {
  if (getApiBaseUrl().length > 0) return true;
  if (typeof window !== "undefined") {
    const injected = (window as Window & { __RETWEET_API_URL__?: string }).__RETWEET_API_URL__;
    if (injected?.startsWith("http")) return true;
    /** منفذ Vite (:3077 / :3080) — بروكسي /health و /v1 حتى على `/` وليس `/app` فقط */
    if (useViteDevProxy()) {
      return true;
    }
    /** VPS — الواجهة والـ API على نفس الأصل (nginx) */
    if (isVpsProductionHost() && (window.location.pathname || "").startsWith("/app")) {
      return true;
    }
    /** Vercel — API عبر بروكسي نفس النطاق */
    if (
      isPublicAppHost() &&
      !isVpsProductionHost() &&
      (window.location.pathname || "").startsWith("/app")
    ) {
      return true;
    }
  }
  return false;
}

/** مفعّل فقط عند وجود مسار API — لا يكفي كون الصفحة على /app في الإنتاج */
export const apiBackendEnabled = (): boolean => hasApiBackendConnection();

export { ensureApiRuntimeConfig };

export function getApiToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setApiToken(token: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

/** إزالة كلمات المرور والمتابعات قبل الإرسال — المتابعات تُدار عبر /v1/social فقط */
export function sanitizeAppStateForSync(state: AppState): AppState {
  const ownerId = state.currentUserId;
  const base =
    ownerId && !isGuestUserId(ownerId)
      ? scopeAppStateToAccount(ownerId, state, {
          accountIds: snapshotAccountIdsForOwner(ownerId),
          isolateOwnedUsers: (id, s) => isolateUsersForAccountCache(id, s),
        })
      : state;
  return {
    ...base,
    users: (base.users || []).map(u => ({
      ...u,
      password: "",
      following: [],
      followers: [],
      followRequestIn: [],
      followRequestOut: [],
    })),
    /** الرسائل تُحفظ عبر /v1/messages و messages.json — لا نرفع آلاف الرسائل/الوسائط في كل مزامنة */
    chats: (base.chats || []).map(c => ({
      ...c,
      messages: [],
    })),
  };
}

const API_FETCH_TIMEOUT_MS = 25_000;

function buildApiUrl(path: string, base: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  if (!base) return p;
  return `${base.replace(/\/$/, "")}${p}`;
}

export async function apiFetch(
  path: string,
  init: RequestInit & { token?: string | null; timeoutMs?: number } = {},
) {
  await ensureApiRuntimeConfig();
  const base = getApiBaseUrl();
  const devProxy =
    import.meta.env.DEV &&
    useViteDevProxy() &&
    typeof window !== "undefined" &&
    (window.location.pathname || "").startsWith("/app");
  if (!base && !devProxy) {
    return new Response(
      JSON.stringify({
        error: isPublicAppHost()
          ? "الخادم غير متصل — تأكد من اتصال الإنترنت أو جرّب لاحقاً"
          : "الخادم غير متصل — شغّل npm run stack:reyweet للتطوير المحلي",
      }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }
  const url = buildApiUrl(path, base);
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body && typeof init.body === "string") {
    headers.set("Content-Type", "application/json");
  }
  const t = init.token ?? getApiToken();
  if (t) headers.set("Authorization", `Bearer ${t}`);

  const ctl = new AbortController();
  const { timeoutMs: fetchTimeoutMs, ...fetchInit } = init;
  const timer = setTimeout(() => ctl.abort(), fetchTimeoutMs ?? API_FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...fetchInit, headers, signal: ctl.signal, cache: "no-store" });
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    const hint =
      import.meta.env.DEV && url.startsWith("/")
        ? " — تأكد أن الخادم يعمل: npm run backend:dev (والواجهة عبر npm run spa:dev:lan)"
        : import.meta.env.DEV
          ? ` — العنوان: ${url}`
          : "";
    const msg = aborted
      ? `انتهت مهلة الاتصال بالخادم${hint}`
      : `تعذر الاتصال بالخادم${hint}`;
    return new Response(JSON.stringify({ error: msg }), {
      status: aborted ? 504 : 503,
      headers: { "Content-Type": "application/json" },
    });
  } finally {
    clearTimeout(timer);
  }
}

export type ApiAuthUser = {
  id: string;
  username: string;
  email: string;
  avatar?: string;
};

export async function apiLogin(
  identifier: string,
  password: string,
): Promise<
  | { ok: true; token: string; userId: string; user: ApiAuthUser }
  | { ok: true; requiresOtp: true; emailHint?: string }
  | { ok: false; error: string }
> {
  const res = await apiFetch("/auth/login", {
    method: "POST",
    body: JSON.stringify({ identifier: identifier.trim(), password }),
    token: null,
  });
  const data = (await res.json().catch(() => ({}))) as {
    token?: string;
    error?: string;
    user?: ApiAuthUser;
    requiresOtp?: boolean;
    emailHint?: string;
  };
  if (res.status === 503 || res.status === 504) {
    return { ok: false, error: data.error || "تعذر الاتصال بالخادم — شغّل: npm run backend:dev" };
  }
  if (!res.ok) return { ok: false, error: data.error || "فشل تسجيل الدخول" };
  if (data.requiresOtp) {
    return { ok: true, requiresOtp: true, emailHint: data.emailHint };
  }
  if (!data.token || !data.user?.id) return { ok: false, error: "استجابة غير صالحة" };
  return { ok: true, token: data.token, userId: data.user.id, user: data.user };
}

export async function apiVerifyLogin(
  identifier: string,
  code: string,
): Promise<
  | { ok: true; token: string; userId: string; user: ApiAuthUser }
  | { ok: false; error: string }
> {
  const res = await apiFetch("/auth/verify-login", {
    method: "POST",
    body: JSON.stringify({ identifier: identifier.trim(), code: code.trim() }),
    token: null,
  });
  const data = (await res.json().catch(() => ({}))) as {
    token?: string;
    error?: string;
    user?: ApiAuthUser;
  };
  if (!res.ok) return { ok: false, error: data.error || "فشل التحقق" };
  if (!data.token || !data.user?.id) return { ok: false, error: "استجابة غير صالحة" };
  return { ok: true, token: data.token, userId: data.user.id, user: data.user };
}

export async function apiGetAuthConfig(): Promise<{
  signupOtpRequired: boolean;
  loginOtpRequired: boolean;
  passwordResetUsesLink: boolean;
  smtpConfigured: boolean;
}> {
  const res = await apiFetch("/auth/config", { method: "GET", token: null });
  if (!res.ok) {
    return {
      signupOtpRequired: true,
      loginOtpRequired: false,
      passwordResetUsesLink: false,
      smtpConfigured: false,
    };
  }
  const data = (await res.json().catch(() => ({}))) as {
    signupOtpRequired?: boolean;
    loginOtpRequired?: boolean;
    passwordResetUsesLink?: boolean;
    smtpConfigured?: boolean;
  };
  return {
    signupOtpRequired: data.signupOtpRequired !== false,
    loginOtpRequired: !!data.loginOtpRequired,
    passwordResetUsesLink: !!data.passwordResetUsesLink,
    smtpConfigured: !!data.smtpConfigured,
  };
}

export async function apiRequestSignupVerification(
  email: string,
  username: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await apiFetch("/auth/request-signup-verification", {
    method: "POST",
    body: JSON.stringify({
      email: email.trim().toLowerCase(),
      username: username.trim().toLowerCase().replace(/[^a-z0-9_]/g, ""),
    }),
    token: null,
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; devCode?: string };
  if (!res.ok) return { ok: false, error: data.error || "تعذر إرسال كود التحقق" };
  return { ok: true };
}

export async function apiRegister(
  email: string,
  username: string,
  password: string,
  code?: string,
  phone?: string,
): Promise<
  | { ok: true; token: string; userId: string; user: ApiAuthUser }
  | { ok: false; error: string }
> {
  const res = await apiFetch("/auth/register", {
    method: "POST",
    body: JSON.stringify({
      email: email.trim().toLowerCase(),
      username: username.trim().toLowerCase().replace(/[^a-z0-9_]/g, ""),
      password,
      code: code?.trim() || undefined,
      phone: phone?.trim() || undefined,
    }),
    token: null,
  });
  const data = (await res.json().catch(() => ({}))) as {
    token?: string;
    error?: string;
    user?: ApiAuthUser;
  };
  if (!res.ok) return { ok: false, error: data.error || "فشل إنشاء الحساب" };
  if (!data.token || !data.user?.id) return { ok: false, error: "استجابة غير صالحة" };
  return { ok: true, token: data.token, userId: data.user.id, user: data.user };
}

export type ApiSearchUser = {
  id: string;
  username: string;
  displayName?: string;
  avatar: string;
  bio?: string;
  verified?: boolean;
  /** حساب خاص — يُرجَع من نهايات المستخدم العامة */
  isPrivate?: boolean;
  followers?: string[];
  following?: string[];
  followerCount?: number;
  followingCount?: number;
  isSubscribed?: boolean;
  subscriptionPlan?: string;
  subscriptionExpiresAt?: string;
  verificationStatus?: "none" | "pending" | "approved" | "rejected";
  verificationBadgeColor?: "blue" | "pink";
  canUseAnimatedAvatar?: boolean;
  storyMaxDuration?: number;
  storyExpiryOptions?: number[];
  postCharacterLimit?: number;
  founderVerified?: boolean;
  founderOfficialLabel?: string;
  appOfficialVerified?: boolean;
  appOfficialLabel?: string;
};

/** حساب minimal للعرض بعد البحث — يُدمَج في الحالة عبر mergeDiscoveredUsers */
export function userFromSearchResult(row: ApiSearchUser): User {
  return {
    id: row.id,
    username: row.username,
    displayName: row.displayName?.trim() || undefined,
    email: "",
    password: "",
    avatar: row.avatar || row.username.slice(0, 2).toUpperCase(),
    bio: row.bio ?? "",
    isPrivate: row.isPrivate === true,
    followers: Array.isArray(row.followers) ? row.followers : [],
    following: Array.isArray(row.following) ? row.following : [],
    displayFollowerCount:
      typeof row.followerCount === "number" ? row.followerCount : undefined,
    highlights: [],
    followRequestIn: [],
    followRequestOut: [],
    publicChannelIds: [],
    blocked: [],
    closeFriends: [],
    favorites: [],
    profileViews: [],
    favoriteStickerContents: [],
    createdStickerContents: [],
    pinnedChatIds: [],
    mutedChatIds: [],
    verified: row.verified === true,
    isSubscribed: row.isSubscribed === true,
    subscriptionPlan: row.subscriptionPlan,
    subscriptionExpiresAt: row.subscriptionExpiresAt,
    verificationStatus: row.verificationStatus,
    verificationBadgeColor: row.verificationBadgeColor,
    canUseAnimatedAvatar: row.canUseAnimatedAvatar === true,
    storyMaxDuration: row.storyMaxDuration,
    storyExpiryOptions: row.storyExpiryOptions,
    postCharacterLimit: row.postCharacterLimit,
    founderVerified: row.founderVerified === true,
    founderOfficialLabel: row.founderOfficialLabel,
    appOfficialVerified: row.appOfficialVerified === true,
    appOfficialLabel: row.appOfficialLabel,
  };
}

export async function apiLookupUserByUsername(username: string): Promise<ApiSearchUser | null> {
  const u = username.trim();
  if (!u) return null;
  const token = getApiToken();
  if (!token) return null;
  const res = await apiFetch(`/v1/users/by-username/${encodeURIComponent(u)}`, {
    method: "GET",
    token,
  });
  if (!res.ok) return null;
  const data = (await res.json().catch(() => null)) as { user?: ApiSearchUser } | null;
  return data?.user ?? null;
}

export async function apiFetchUserById(userId: ID): Promise<ApiSearchUser | null> {
  const id = userId.trim();
  if (!id) return null;
  const token = getApiToken();
  if (!token) return null;
  const res = await apiFetch(`/v1/users/${encodeURIComponent(id)}`, {
    method: "GET",
    token,
  });
  if (!res.ok) return null;
  const data = (await res.json().catch(() => null)) as { user?: ApiSearchUser } | null;
  return data?.user ?? null;
}

export async function apiSearchUsers(query: string): Promise<ApiSearchUser[]> {
  const q = query.trim();
  if (!q) return [];
  const token = getApiToken();
  if (!token) return [];
  const res = await apiFetch(
    `/v1/users/search?q=${encodeURIComponent(q)}&_=${Date.now()}`,
    {
      method: "GET",
      token,
      headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
    },
  );
  if (!res.ok) return [];
  const data = (await res.json().catch(() => null)) as { users?: ApiSearchUser[] } | null;
  return data?.users ?? [];
}

/** كل المستخدمين المسجّلين على الخادم (مصدر البحث والمنشن) */
export async function apiFetchUserDirectory(): Promise<ApiSearchUser[]> {
  const token = getApiToken();
  if (!token) return [];
  const res = await apiFetch(`/v1/users/directory?_=${Date.now()}`, {
    method: "GET",
    token,
    headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
  });
  if (!res.ok) return [];
  const data = (await res.json().catch(() => null)) as { users?: ApiSearchUser[] } | null;
  return data?.users ?? [];
}

export async function apiIsUsernameAvailable(username: string, exceptUserId?: string): Promise<boolean> {
  const u = username.trim().toLowerCase();
  if (!u) return false;
  const token = getApiToken();
  if (!token) {
    const row = await apiLookupUserByUsername(u);
    if (!row) return true;
    return exceptUserId ? row.id === exceptUserId : false;
  }
  const res = await apiFetch(
    `/v1/me/username-available/${encodeURIComponent(u)}?_=${Date.now()}`,
    { method: "GET", token },
  );
  if (res.ok) {
    const data = (await res.json().catch(() => ({}))) as { available?: boolean };
    if (typeof data.available === "boolean") return data.available;
  }
  const row = await apiLookupUserByUsername(u);
  if (!row) return true;
  return exceptUserId ? row.id === exceptUserId : false;
}

export async function apiListRecentUsers(limit = 30): Promise<ApiSearchUser[]> {
  const token = getApiToken();
  if (!token) return [];
  const res = await apiFetch(`/v1/users/recent?limit=${limit}&_=${Date.now()}`, {
    method: "GET",
    token,
    headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
  });
  if (!res.ok) return [];
  const data = (await res.json().catch(() => null)) as { users?: ApiSearchUser[] } | null;
  return data?.users ?? [];
}

export async function pullRemoteAppState(token: string): Promise<AppState | null> {
  const res = await apiFetch("/v1/app-state", { method: "GET", token });
  if (!res.ok) return null;
  const data = (await res.json().catch(() => null)) as { state?: AppState } | null;
  if (!data?.state) return null;
  try {
    const { normalizePersistedAppState } = await import("./store");
    return normalizePersistedAppState(data.state);
  } catch (e) {
    console.warn("[Retweet] normalize remote state failed", e);
    return null;
  }
}

export async function pushRemoteAppState(token: string, state: AppState): Promise<boolean> {
  const { shouldAllowRemotePush } = await import("./remotePushGate");
  if (!shouldAllowRemotePush(state)) return false;
  const body = JSON.stringify({ state: sanitizeAppStateForSync(state) });
  const res = await apiFetch("/v1/app-state", { method: "PUT", body, token });
  return res.ok;
}

export async function apiCreateStory(
  token: string,
  story: {
    id: string;
    userId: string;
    image: string;
    video?: string;
    createdAt: number;
    audience: "all" | "close";
    stickers?: unknown[];
    expiryHours?: number;
  },
): Promise<{ ok: true; story: AppState["stories"][number] } | { ok: false; error: string }> {
  const res = await apiFetch("/v1/stories", {
    method: "POST",
    token,
    timeoutMs: 90_000,
    body: JSON.stringify({
      id: story.id,
      image: story.image,
      video: story.video,
      audience: story.audience,
      stickers: story.stickers,
      createdAt: story.createdAt,
      expiryHours: story.expiryHours,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    story?: AppState["stories"][number];
    error?: string;
  };
  if (!res.ok || !data.story) {
    return { ok: false, error: data.error || "تعذر نشر الستوري على الخادم" };
  }
  return { ok: true, story: data.story };
}

export async function apiChangePassword(
  token: string,
  oldPassword: string,
  newPassword: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await apiFetch("/v1/me/password", {
    method: "PUT",
    body: JSON.stringify({ oldPassword, newPassword }),
    token,
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) return { ok: false, error: data.error || "فشل تغيير كلمة المرور" };
  return { ok: true };
}

export async function apiRequestPasswordReset(
  identifier: string,
): Promise<
  | { ok: true; method: "code"; message?: string }
  | { ok: false; error: string }
> {
  const res = await apiFetch("/auth/request-password-reset", {
    method: "POST",
    body: JSON.stringify({ identifier: identifier.trim() }),
    token: null,
  });
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    devCode?: string;
    devResetLink?: string;
    method?: "link" | "code";
  };
  if (!res.ok) return { ok: false, error: data.error || "تعذر الطلب" };
  return {
    ok: true,
    method: "code",
    message: typeof (data as { message?: string }).message === "string"
      ? (data as { message?: string }).message
      : undefined,
  };
}

export async function apiCompletePasswordResetLink(
  token: string,
  newPassword: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await apiFetch("/auth/complete-password-reset-link", {
    method: "POST",
    body: JSON.stringify({ token: token.trim(), newPassword }),
    token: null,
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) return { ok: false, error: data.error || "تعذر التحقق" };
  return { ok: true };
}

/** دمج رسائل محلية مع رسائل الخادم (بدون تكرار) */
export function mergeChatMessages(local: Message[], remote: Message[]): Message[] {
  const byId = new Map<string, Message>();
  for (const m of local) byId.set(m.id, m);
  for (const m of remote) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => a.createdAt - b.createdAt);
}

export async function apiPostMessage(
  token: string,
  chatId: ID,
  receiverId: ID | null,
  message: Message,
): Promise<Message | null> {
  const res = await apiFetch("/v1/messages", {
    method: "POST",
    token,
    body: JSON.stringify({
      id: message.id,
      chatId,
      receiverId,
      type: message.type,
      content: message.content,
      createdAt: message.createdAt,
      durationSec: message.durationSec,
      shareText: message.shareText,
      viewOnce: message.viewOnce,
      viewOnceOpenedByUserIds: message.viewOnceOpenedByUserIds,
      replyTo: message.replyTo,
      reactions: message.reactions,
      forwardedFrom: message.forwardedFrom,
    }),
  });
  if (!res.ok) return null;
  const data = (await res.json().catch(() => null)) as { message?: Message } | null;
  return data?.message ?? message;
}

/** إرسال حالة الكتابة عبر REST عندما WebSocket غير متصل */
export async function apiPostChatTyping(
  token: string,
  chatId: ID,
  peerId: ID | null,
  active: boolean,
): Promise<boolean> {
  const res = await apiFetch("/v1/chats/typing", {
    method: "POST",
    token,
    body: JSON.stringify({
      chatId,
      peerId: peerId ?? undefined,
      active,
    }),
  });
  return res.ok;
}

export type SocialToggleMode = "following" | "unfollowed" | "requested" | "request_cancelled";

export type SocialRelation = {
  isFollowing: boolean;
  isFollowedBy: boolean;
  pendingOut: boolean;
  pendingIn: boolean;
};

export async function apiGetSocialRelation(
  token: string,
  targetUserId: ID,
): Promise<{ ok: true; relation: SocialRelation } | { ok: false; error: string }> {
  const res = await apiFetch(`/v1/social/relation/${encodeURIComponent(targetUserId)}`, {
    method: "GET",
    token,
  });
  const data = (await res.json().catch(() => ({}))) as { relation?: SocialRelation; error?: string };
  if (!res.ok || !data.relation) return { ok: false, error: data.error || "تعذر جلب حالة المتابعة" };
  return { ok: true, relation: data.relation };
}

export async function apiToggleFollow(
  token: string,
  targetUserId: ID,
): Promise<
  | { ok: true; mode: SocialToggleMode; relation: SocialRelation }
  | { ok: false; error: string }
> {
  const res = await apiFetch("/v1/social/follow/toggle", {
    method: "POST",
    token,
    body: JSON.stringify({ targetUserId }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    mode?: SocialToggleMode;
    relation?: SocialRelation;
    error?: string;
  };
  if (!res.ok || !data.mode || !data.relation) {
    return { ok: false, error: data.error || "فشل المتابعة" };
  }
  return { ok: true, mode: data.mode, relation: data.relation };
}

export async function apiAcceptFollowRequest(
  token: string,
  fromUserId: ID,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await apiFetch("/v1/social/follow-request/accept", {
    method: "POST",
    token,
    body: JSON.stringify({ fromUserId }),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) return { ok: false, error: data.error || "فشل قبول الطلب" };
  return { ok: true };
}

export async function apiDeclineFollowRequest(
  token: string,
  fromUserId: ID,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await apiFetch("/v1/social/follow-request/decline", {
    method: "POST",
    token,
    body: JSON.stringify({ fromUserId }),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) return { ok: false, error: data.error || "فشل رفض الطلب" };
  return { ok: true };
}

export async function apiRecordProfileVisit(
  token: string,
  targetUserId: string,
): Promise<void> {
  try {
    await apiFetch(`/v1/users/${encodeURIComponent(targetUserId)}/visit`, {
      method: "POST",
      token,
    });
  } catch {
    /* silent — visits are non-critical */
  }
}

export async function apiPatchProfile(
  token: string,
  patch: {
    username?: string;
    displayName?: string;
    avatar?: string;
    bio?: string;
    note?: string;
    profileLink?: string;
    isPrivate?: boolean;
    email?: string;
    phone?: string;
  },
): Promise<{ ok: true; user: ApiSearchUser } | { ok: false; error: string }> {
  const res = await apiFetch("/v1/me/profile", {
    method: "PATCH",
    token,
    body: JSON.stringify(patch),
  });
  const data = (await res.json().catch(() => ({}))) as {
    user?: ApiSearchUser;
    error?: string;
  };
  if (!res.ok || !data.user) return { ok: false, error: data.error || "فشل حفظ البروفايل" };
  return { ok: true, user: data.user };
}

export async function apiUploadMedia(
  token: string,
  file: File,
  opts?: { timeoutMs?: number; storyVideo?: boolean; avatarAnimated?: boolean },
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  await ensureApiRuntimeConfig();
  const base = getApiBaseUrl().replace(/\/$/, "");
  if (!base) {
    return {
      ok: false,
      error: "الخادم غير متصل — تأكد أن API يعمل (npm run api:tunnel)",
    };
  }
  let uploadPath = "/v1/media/upload";
  const q: string[] = [];
  if (opts?.storyVideo) q.push("story=1");
  if (opts?.avatarAnimated) q.push("avatar=1");
  if (q.length) uploadPath += `?${q.join("&")}`;
  const url = `${base}${uploadPath}`;
  const fd = new FormData();
  fd.append("file", file);
  const ctl = new AbortController();
  const timeoutMs = opts?.timeoutMs ?? API_FETCH_TIMEOUT_MS;
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
      signal: ctl.signal,
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    if (res.status === 413) {
      return {
        ok: false,
        error: "الملف كبير جداً — جرّب فيديو أقصر (دقيقة) أو صورة أخف",
      };
    }
    if (!res.ok || !data.url) {
      const err = data.error || "";
      if (/compress|ضغط/i.test(err)) {
        return { ok: false, error: "تعذر ضغط الملف — جرّب صيغة MP4 أو JPG" };
      }
      return {
        ok: false,
        error: err || (file.type.startsWith("video/") ? "فشل رفع الفيديو" : "فشل رفع الصورة"),
      };
    }
    return { ok: true, url: data.url };
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    return {
      ok: false,
      error: aborted
        ? file.type.startsWith("video/")
          ? "انتهت مهلة رفع الفيديو — جرّب شبكة أسرع أو مقطعاً أقصر"
          : "انتهت مهلة رفع الملف — جرّب مرة أخرى"
        : "تعذر الاتصال بالخادم — تأكد أن npm run api:tunnel يعمل على جهازك",
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function apiFetchChatMessages(token: string, chatId: ID): Promise<Message[]> {
  const res = await apiFetch(`/v1/chats/${encodeURIComponent(chatId)}/messages`, {
    method: "GET",
    token,
  });
  if (!res.ok) return [];
  const data = (await res.json().catch(() => null)) as { messages?: Message[] } | null;
  return data?.messages ?? [];
}

export async function apiCreateGroup(
  token: string,
  body: {
    id: string;
    name: string;
    avatar: string;
    memberIds: string[];
    welcomeMessage?: string;
  },
): Promise<{ ok: true; chat: Chat } | { ok: false; error: string }> {
  const res = await apiFetch("/v1/chats/group", {
    method: "POST",
    token,
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { chat?: Chat; error?: string };
  if (!res.ok || !data.chat) return { ok: false, error: data.error || "فشل إنشاء المجموعة" };
  return { ok: true, chat: data.chat };
}

export async function apiAddGroupMembers(
  token: string,
  chatId: ID,
  memberIds: ID[],
): Promise<{ ok: true; chat?: Chat } | { ok: false; error: string }> {
  const res = await apiFetch(`/v1/chats/group/${encodeURIComponent(chatId)}/members`, {
    method: "POST",
    token,
    body: JSON.stringify({ memberIds }),
  });
  const data = (await res.json().catch(() => ({}))) as { chat?: Chat; error?: string };
  if (!res.ok) return { ok: false, error: data.error || "فشل إضافة الأعضاء" };
  return { ok: true, chat: data.chat };
}

export async function apiPatchGroup(
  token: string,
  chatId: ID,
  patch: { name?: string; avatar?: string; isPublicGroup?: boolean; regenerateInvite?: boolean },
): Promise<{ ok: true; chat?: Chat } | { ok: false; error: string }> {
  const res = await apiFetch(`/v1/chats/group/${encodeURIComponent(chatId)}`, {
    method: "PATCH",
    token,
    body: JSON.stringify(patch),
  });
  const data = (await res.json().catch(() => ({}))) as { chat?: Chat; error?: string };
  if (!res.ok) return { ok: false, error: data.error || "فشل التحديث" };
  return { ok: true, chat: data.chat };
}

export async function apiKickGroupMember(
  token: string,
  chatId: ID,
  userId: ID,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await apiFetch(
    `/v1/chats/group/${encodeURIComponent(chatId)}/members/${encodeURIComponent(userId)}`,
    { method: "DELETE", token },
  );
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) return { ok: false, error: data.error || "فشل الطرد" };
  return { ok: true };
}

export async function apiLeaveGroup(
  token: string,
  chatId: ID,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await apiFetch(`/v1/chats/group/${encodeURIComponent(chatId)}/leave`, {
    method: "POST",
    token,
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) return { ok: false, error: data.error || "فشل المغادرة" };
  return { ok: true };
}

export type GroupInvitePreview = {
  inviteCode: string;
  chatId: string;
  name: string;
  avatar: string;
  memberCount: number;
  isPublicGroup: boolean;
  alreadyMember: boolean;
};

export async function apiFetchGroupInvitePreview(
  token: string,
  code: string,
): Promise<GroupInvitePreview | null> {
  const res = await apiFetch(`/v1/chats/group/invite/${encodeURIComponent(code)}`, {
    method: "GET",
    token,
  });
  if (!res.ok) return null;
  return (await res.json().catch(() => null)) as GroupInvitePreview | null;
}

export async function apiJoinGroupByInvite(
  token: string,
  code: string,
): Promise<
  | { ok: true; joined: boolean; pending?: boolean; chat?: Chat }
  | { ok: false; error: string }
> {
  const res = await apiFetch(`/v1/chats/group/invite/${encodeURIComponent(code)}/join`, {
    method: "POST",
    token,
  });
  const data = (await res.json().catch(() => ({}))) as {
    chat?: Chat;
    joined?: boolean;
    pending?: boolean;
    error?: string;
  };
  if (!res.ok) return { ok: false, error: data.error || "تعذر الانضمام" };
  return {
    ok: true,
    joined: data.joined === true,
    pending: data.pending === true,
    chat: data.chat,
  };
}

export async function apiRespondGroupJoinRequest(
  token: string,
  chatId: ID,
  userId: ID,
  action: "accept" | "reject",
): Promise<{ ok: true; chat?: Chat } | { ok: false; error: string }> {
  const res = await apiFetch(
    `/v1/chats/group/${encodeURIComponent(chatId)}/join-requests/${encodeURIComponent(userId)}`,
    { method: "POST", token, body: JSON.stringify({ action }) },
  );
  const data = (await res.json().catch(() => ({}))) as { chat?: Chat; error?: string };
  if (!res.ok) return { ok: false, error: data.error || "فشل الإجراء" };
  return { ok: true, chat: data.chat };
}

export async function apiCompletePasswordReset(
  identifier: string,
  code: string,
  newPassword: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await apiFetch("/auth/complete-password-reset", {
    method: "POST",
    body: JSON.stringify({ identifier: identifier.trim(), code: code.trim(), newPassword }),
    token: null,
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) return { ok: false, error: data.error || "تعذر التحقق" };
  return { ok: true };
}
