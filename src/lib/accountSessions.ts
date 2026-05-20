import type { AppState, ID, User } from "./types";
import { getApiToken, setApiToken } from "./apiBackend";
import { mergeUserFromServer, mergeUserProfilePatch } from "./mergeUserSocial";
import { scopeAppStateToAccount } from "./scopeAppState";

export type AccountSessionMeta = {
  userId: ID;
  token: string;
  username: string;
  email: string;
  avatar?: string;
};

type SessionsStore = {
  order: ID[];
  sessions: Record<ID, AccountSessionMeta>;
};

const SESSIONS_KEY = "retweet_account_sessions";
const CACHE_PREFIX = "retweet_account_state_";
const LAST_ACTIVE_USER_KEY = "retweet_last_active_user_id";

export const ACCOUNT_SWITCHED_EVENT = "retweet-account-switched";
export const ACCOUNT_SWITCH_BEGIN_EVENT = "retweet-account-switch-begin";
export const ACCOUNT_SWITCH_END_EVENT = "retweet-account-switch-end";

function readSessions(): SessionsStore {
  if (typeof window === "undefined") return { order: [], sessions: {} };
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    if (!raw) return { order: [], sessions: {} };
    const j = JSON.parse(raw) as SessionsStore;
    return {
      order: Array.isArray(j.order) ? j.order : [],
      sessions: j.sessions && typeof j.sessions === "object" ? j.sessions : {},
    };
  } catch {
    return { order: [], sessions: {} };
  }
}

function writeSessions(store: SessionsStore): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(store));
  } catch {
    /* ignore */
  }
}

export function listAccountSessions(): AccountSessionMeta[] {
  const { order, sessions } = readSessions();
  return order.map(id => sessions[id]).filter(Boolean);
}

export function getAccountSession(userId: ID): AccountSessionMeta | null {
  return readSessions().sessions[userId] ?? null;
}

export function upsertAccountSession(meta: AccountSessionMeta): void {
  const store = readSessions();
  store.sessions[meta.userId] = meta;
  if (!store.order.includes(meta.userId)) store.order.push(meta.userId);
  writeSessions(store);
}

export function removeAccountSession(userId: ID): void {
  const store = readSessions();
  delete store.sessions[userId];
  store.order = store.order.filter(id => id !== userId);
  writeSessions(store);
  try {
    localStorage.removeItem(`${CACHE_PREFIX}${userId}`);
  } catch {
    /* ignore */
  }
}

export function getLastActiveUserId(): ID | null {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(LAST_ACTIVE_USER_KEY)?.trim();
    return v || null;
  } catch {
    return null;
  }
}

export function setLastActiveUserId(userId: ID | null): void {
  if (typeof window === "undefined") return;
  try {
    if (userId) localStorage.setItem(LAST_ACTIVE_USER_KEY, userId);
    else localStorage.removeItem(LAST_ACTIVE_USER_KEY);
  } catch {
    /* ignore */
  }
}

/** يفعّل توكن آخر حساب نشط (أو أول جلسة) قبل أي طلب API */
export function restoreActiveSessionOnLaunch(): ID | null {
  const last = getLastActiveUserId();
  if (last && getAccountSession(last)?.token) {
    activateAccountSession(last);
    return last;
  }
  const first = listAccountSessions()[0];
  if (first?.token) {
    activateAccountSession(first.userId);
    setLastActiveUserId(first.userId);
    return first.userId;
  }
  return null;
}

/** من يملك هذا التوكن في الجلسات المحفوظة؟ */
export function userIdForApiToken(token: string | null): ID | null {
  if (!token) return null;
  for (const id of listAccountSessions()) {
    const meta = getAccountSession(id);
    if (meta?.token === token) return id;
  }
  return null;
}

/**
 * قبل أي طلب API: التوكن في localStorage يجب أن يطابق حساب المُرسل.
 * إن اختلفا نُفعّل جلسة الحساب الصحيح ولا نرسل بالحساب الخطأ.
 */
export function ensureApiTokenMatchesUser(userId: ID): string | null {
  const meta = getAccountSession(userId);
  if (!meta?.token) return null;
  const current = getApiToken();
  if (current === meta.token) return meta.token;
  setApiToken(meta.token);
  setLastActiveUserId(userId);
  return meta.token;
}

export function activateAccountSession(userId: ID): string | null {
  const meta = getAccountSession(userId);
  if (!meta?.token) return null;
  setApiToken(meta.token);
  setLastActiveUserId(userId);
  try {
    window.dispatchEvent(
      new CustomEvent(ACCOUNT_SWITCHED_EVENT, { detail: { userId } }),
    );
  } catch {
    /* ignore */
  }
  return meta.token;
}

/** مزامنة التوكن الحالي مع جلسة حساب نشط */
export function syncActiveApiToken(userId: ID | null, token: string | null): void {
  if (!userId || !token) return;
  const existing = getAccountSession(userId);
  if (existing) {
    upsertAccountSession({ ...existing, token });
  }
}

/** قراءة كاش خام بدون عزل (تجنّب تكرار لا نهائي مع scope/isolate) */
export function readRawAccountStateCache(userId: ID): AppState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(`${CACHE_PREFIX}${userId}`);
    if (!raw) return null;
    return JSON.parse(raw) as AppState;
  } catch {
    return null;
  }
}

/** ملف حساب مسجّل — الجلسة (meta) أولوية؛ لا يستدعي loadAccountStateCache */
export function canonicalOwnedProfileFields(userId: ID): (Partial<User> & { id: ID }) | null {
  const sess = getAccountSession(userId);
  const fromCache = readRawAccountStateCache(userId)?.users.find(u => u.id === userId);
  if (!sess && !fromCache) return null;
  return {
    id: userId,
    username: sess?.username ?? fromCache!.username,
    email: sess?.email ?? fromCache?.email ?? "",
    avatar: sess?.avatar ?? fromCache?.avatar,
    displayName: fromCache?.displayName,
    bio: fromCache?.bio,
    note: fromCache?.note,
    profileLink: fromCache?.profileLink,
    isPrivate: fromCache?.isPrivate,
    verified: fromCache?.verified,
    founderVerified: fromCache?.founderVerified,
    founderOfficialLabel: fromCache?.founderOfficialLabel,
  };
}

/** عند حفظ كاش حساب: لا نكتب يوزر/أفاتار حساب آخر من لقطة الحساب النشط */
export function isolateUsersForAccountCache(ownerId: ID, state: AppState): User[] {
  const owned = new Set(listAccountSessions().map(s => s.userId));
  return state.users.map(u => {
    if (u.id === ownerId) return u;
    if (!owned.has(u.id)) return u;
    const sess = getAccountSession(u.id);
    if (sess) {
      return mergeUserProfilePatch(u, {
        id: u.id,
        username: sess.username,
        email: sess.email,
        avatar: sess.avatar ?? u.avatar,
      });
    }
    const fromRaw = readRawAccountStateCache(u.id)?.users.find(x => x.id === u.id);
    if (!fromRaw) return u;
    return mergeUserProfilePatch(u, {
      id: u.id,
      username: fromRaw.username,
      email: fromRaw.email,
      avatar: fromRaw.avatar ?? u.avatar,
    });
  });
}

/** بعد دمج متعدد الحسابات — كل حساب يستعيد يوزره من جلسته/كاشه */
export function reconcileOwnedAccountProfiles(state: AppState): AppState {
  const owned = listAccountSessions().map(s => s.userId);
  if (!owned.length) return state;
  const ownedSet = new Set(owned);
  return {
    ...state,
    users: state.users.map(u => {
      if (!ownedSet.has(u.id)) return u;
      const canon = canonicalOwnedProfileFields(u.id);
      if (!canon) return u;
      return mergeUserProfilePatch(u, canon);
    }),
  };
}

function scopeCacheState(userId: ID, state: AppState): AppState {
  return scopeAppStateToAccount(userId, state, {
    accountIds: listAccountSessions().map(s => s.userId),
    isolateOwnedUsers: (ownerId, s) => isolateUsersForAccountCache(ownerId, s),
  });
}

export function saveAccountStateCache(userId: ID, state: AppState): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`${CACHE_PREFIX}${userId}`, JSON.stringify(scopeCacheState(userId, state)));
  } catch {
    /* ignore */
  }
}

export function loadAccountStateCache(userId: ID): AppState | null {
  const raw = readRawAccountStateCache(userId);
  if (!raw) return null;
  return scopeCacheState(userId, raw);
}

/**
 * دمج ملفات المستخدمين لكل الحسابات المسجّلة على الجهاز.
 * المصادر الأخيرة في القائمة لها أولوية على حقول الملف (السيرفر يُمرَّر أخيراً).
 */
export function mergeUsersForAccounts(
  accountIds: ID[],
  sources: AppState[],
): AppState["users"] {
  const byId = new Map<ID, User>();
  for (const accId of accountIds) {
    const perSources: AppState[] = [];
    const ownCache = readRawAccountStateCache(accId);
    if (ownCache) perSources.push(ownCache);
    perSources.push(...sources);
    for (const src of perSources) {
      const u = (src.users || []).find(x => x.id === accId);
      if (!u) continue;
      const prev = byId.get(accId);
      byId.set(accId, prev ? mergeUserFromServer(prev, u) : { ...u, password: "" });
    }
    const canon = canonicalOwnedProfileFields(accId);
    if (canon) {
      const prev = byId.get(accId);
      byId.set(accId, prev ? mergeUserProfilePatch(prev, canon) : ({ ...canon, password: "" } as User));
    }
  }
  return [...byId.values()];
}

export function migrateLegacyApiToken(userId: ID, username: string, email: string): void {
  const token = getApiToken();
  if (!token || getAccountSession(userId)) return;
  upsertAccountSession({ userId, token, username, email });
}
