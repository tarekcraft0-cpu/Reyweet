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
/** آخر حسابين تبدّلت بينهما — للضغط مرتين على بروفايل الشريط */
const PROFILE_TOGGLE_PEER_KEY = "retweet_profile_toggle_peer";

export const ACCOUNT_SWITCHED_EVENT = "retweet-account-switched";
export const ACCOUNT_SWITCH_BEGIN_EVENT = "retweet-account-switch-begin";
export const ACCOUNT_SWITCH_END_EVENT = "retweet-account-switch-end";
export const ACCOUNT_SWITCH_FAILED_EVENT = "retweet-account-switch-failed";

/** حسابات محذوفة من المنصة — لا تُستخدم للتبديل السريع */
export const REMOVED_ACCOUNT_IDS = new Set<string>([
  "u_t_account",
  "u_omar",
  "u_sara",
  "u_lina",
]);

export function isValidAccountSwitchTarget(userId: ID): boolean {
  if (!userId || REMOVED_ACCOUNT_IDS.has(userId)) return false;
  return !!getAccountSession(userId)?.token;
}

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

/** يحفظ الزوج (الحساب الحالي ↔ الذي غادرته) للتبديل بالضغط مرتين على أيقونة البروفايل */
export function setProfileTogglePeer(activeUserId: ID, peerUserId: ID): void {
  if (typeof window === "undefined" || activeUserId === peerUserId) return;
  try {
    localStorage.setItem(
      PROFILE_TOGGLE_PEER_KEY,
      JSON.stringify({ active: activeUserId, peer: peerUserId }),
    );
  } catch {
    /* ignore */
  }
}

/** الحساب الآخر في آخر تبديل (ليس كل الحسابات — فقط الثنائي الأخير) */
export function getProfileTogglePeer(currentUserId: ID): ID | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PROFILE_TOGGLE_PEER_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as { active?: ID; peer?: ID };
    let peer: ID | null = null;
    if (j.active === currentUserId && j.peer) peer = j.peer;
    else if (j.peer === currentUserId && j.active) peer = j.active;
    if (peer && isValidAccountSwitchTarget(peer)) return peer;
    if (peer) {
      try {
        localStorage.removeItem(PROFILE_TOGGLE_PEER_KEY);
      } catch {
        /* ignore */
      }
    }
    return null;
  } catch {
    return null;
  }
}

/** إن فشل الزوج المحفوظ — أول حساب آخر صالح على الجهاز */
export function resolveProfileTogglePeer(currentUserId: ID): ID | null {
  const saved = getProfileTogglePeer(currentUserId);
  if (saved) return saved;
  const other = listAccountSessions().find(
    s => s.userId !== currentUserId && isValidAccountSwitchTarget(s.userId),
  );
  return other?.userId ?? null;
}

/** يزيل جلسات الحسابات المحذوفة ويُنظّف التكرار والضغط مرتين */
export function pruneStaleAccountSessions(): void {
  if (typeof window === "undefined") return;
  for (const id of REMOVED_ACCOUNT_IDS) removeAccountSession(id);
  const store = readSessions();
  let changed = false;
  // أزل جلسات بدون token
  for (const id of [...store.order]) {
    if (!store.sessions[id]?.token) {
      delete store.sessions[id];
      store.order = store.order.filter(x => x !== id);
      changed = true;
      try {
        localStorage.removeItem(`${CACHE_PREFIX}${id}`);
      } catch { /* ignore */ }
    }
  }
  // أزل تكرار الـ username: احتفظ بأحدث جلسة (الأخيرة في القائمة)
  const seenUsernames = new Set<string>();
  for (const id of [...store.order].reverse()) {
    const sess = store.sessions[id];
    if (!sess) continue;
    const uname = sess.username.toLowerCase();
    if (seenUsernames.has(uname)) {
      delete store.sessions[id];
      store.order = store.order.filter(x => x !== id);
      changed = true;
      try { localStorage.removeItem(`${CACHE_PREFIX}${id}`); } catch { /* ignore */ }
    } else {
      seenUsernames.add(uname);
    }
  }
  if (changed) writeSessions(store);
  try {
    const raw = localStorage.getItem(PROFILE_TOGGLE_PEER_KEY);
    if (!raw) return;
    const j = JSON.parse(raw) as { active?: ID; peer?: ID };
    const bad =
      (j.active && !isValidAccountSwitchTarget(j.active)) ||
      (j.peer && !isValidAccountSwitchTarget(j.peer));
    if (bad) localStorage.removeItem(PROFILE_TOGGLE_PEER_KEY);
  } catch {
    localStorage.removeItem(PROFILE_TOGGLE_PEER_KEY);
  }
}

/** عدد الحسابات المسجّلة على الجهاز (للتبديل السريع) */
export function countLoggedInAccountSessions(): number {
  return listAccountSessions().filter(s => !!s.token).length;
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

/** يبدّل التوكن دون إعادة ربط Socket — يُستدعى أثناء التبديل قبل اكتمال الحالة */
export function applyAccountSessionToken(userId: ID): string | null {
  const meta = getAccountSession(userId);
  if (!meta?.token) return null;
  setApiToken(meta.token);
  setLastActiveUserId(userId);
  return meta.token;
}

export function activateAccountSession(
  userId: ID,
  opts?: { emitSwitchedEvent?: boolean },
): string | null {
  const token = applyAccountSessionToken(userId);
  if (!token) return null;
  if (opts?.emitSwitchedEvent !== false) {
    try {
      window.dispatchEvent(
        new CustomEvent(ACCOUNT_SWITCHED_EVENT, { detail: { userId } }),
      );
    } catch {
      /* ignore */
    }
  }
  return token;
}

export function emitAccountSwitchedEvent(userId: ID): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(
      new CustomEvent(ACCOUNT_SWITCHED_EVENT, { detail: { userId } }),
    );
  } catch {
    /* ignore */
  }
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

/** ملف حساب مسجّل — الجلسة (meta) لليوزر/الإيميل فقط؛ الأفتار من السيرفر */
export function canonicalOwnedProfileFields(userId: ID): (Partial<User> & { id: ID }) | null {
  const sess = getAccountSession(userId);
  const fromCache = readRawAccountStateCache(userId)?.users.find(u => u.id === userId);
  if (!sess && !fromCache) return null;
  return {
    id: userId,
    username: sess?.username ?? fromCache!.username,
    email: sess?.email ?? fromCache?.email ?? "",
  };
}

/** في لقطة التطبيق: الحساب النشط فقط — الجلسات الأخرى تبقى في retweet_account_sessions */
export function snapshotAccountIdsForOwner(ownerId: ID): ID[] {
  return ownerId ? [ownerId] : [];
}

/** إزالة ملفات الحسابات الأخرى المسجّلة من مصفوفة users (منع تداخل المتابعات/الملف) */
export function stripOtherOwnedAccountsFromUsers(ownerId: ID, users: User[]): User[] {
  const owned = new Set(listAccountSessions().map(s => s.userId));
  return users.filter(u => u.id === ownerId || !owned.has(u.id));
}

/** عند حفظ كاش حساب: لا نخزّن بيانات حسابات أخرى مسجّلة في نفس الجهاز */
export function isolateUsersForAccountCache(ownerId: ID, state: AppState): User[] {
  return stripOtherOwnedAccountsFromUsers(ownerId, state.users || []);
}

/** تصحيح ملف الحساب النشط — يوزر/إيميل من الجلسة؛ الأفتار من state (السيرفر) */
export function reconcileOwnedAccountProfiles(state: AppState): AppState {
  const cur = state.currentUserId;
  if (!cur) return state;
  const live = (state.users || []).find(u => u.id === cur);
  const canon = canonicalOwnedProfileFields(cur);
  if (!live && !canon) return state;
  let merged = live ?? ({ id: cur, username: "?", email: "", password: "", avatar: "?" } as User);
  if (canon) {
    merged = mergeUserProfilePatch(merged, {
      id: cur,
      username: canon.username ?? merged.username,
      email: canon.email ?? merged.email,
    });
  }
  return {
    ...state,
    users: (state.users || []).map(u => (u.id === cur ? merged : u)),
  };
}

function scopeCacheState(userId: ID, state: AppState): AppState {
  return scopeAppStateToAccount(userId, state, {
    accountIds: snapshotAccountIdsForOwner(userId),
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
      if (prev) {
        byId.set(
          accId,
          mergeUserProfilePatch(prev, {
            id: accId,
            username: canon.username ?? prev.username,
            email: canon.email ?? prev.email,
          }),
        );
      }
    }
  }
  return [...byId.values()];
}

export function migrateLegacyApiToken(userId: ID, username: string, email: string): void {
  const token = getApiToken();
  if (!token || getAccountSession(userId)) return;
  upsertAccountSession({ userId, token, username, email });
}
