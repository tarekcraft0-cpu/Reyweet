/**
 * تهيئة جلسة الويب بعد تسجيل الدخول — /app مرتبط بقاعدة البيانات عبر Retweet API.
 */
import { apiBackendEnabled, ensureApiRuntimeConfig, getApiToken, pullRemoteAppState } from "./apiBackend";
import { restoreActiveSessionOnLaunch } from "./accountSessions";
import { logAuthRoute } from "./authRouteDebug";
import { applyAuthoritativeProfile, mergeUserFromServer } from "./mergeUserSocial";
import { scopeAppStateToAccount } from "./scopeAppState";
import { isolateUsersForAccountCache, listAccountSessions } from "./accountSessions";
import { normalizePersistedAppState, readPersistedAppState } from "./store";
import type { AppState } from "./types";

import { runChatIsolationMigration } from "./chatIsolationMigration";

const STORAGE_KEY = "retweet_state_v2";

function loadPersisted(): AppState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AppState;
  } catch {
    return null;
  }
}

function savePersisted(state: AppState) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

async function hydrateFromApiToken(): Promise<boolean> {
  restoreActiveSessionOnLaunch();
  const token = getApiToken();
  if (!token) return false;
  const remote = await pullRemoteAppState(token);
  if (!remote) return false;
  const base = loadPersisted() ?? readPersistedAppState();
  const activeId = remote.currentUserId ?? base.currentUserId ?? null;
  if (!activeId) return false;

  const byId = new Map((base.users || []).map(u => [u.id, u]));
  const serverMe = (remote.users || []).find(u => u.id === activeId);
  for (const u of remote.users || []) {
    const prev = byId.get(u.id);
    let merged = prev ? mergeUserFromServer(prev, u) : u;
    if (serverMe && u.id === activeId) {
      merged = applyAuthoritativeProfile(merged, serverMe);
    }
    byId.set(u.id, merged);
  }

  const merged = normalizePersistedAppState({
    ...base,
    ...remote,
    currentUserId: activeId,
    users: [...byId.values()],
  });
  savePersisted(
    scopeAppStateToAccount(activeId, merged, {
      accountIds: listAccountSessions().map(s => s.userId),
      isolateOwnedUsers: (ownerId, s) => isolateUsersForAccountCache(ownerId, s),
    }),
  );
  logAuthRoute("bootstrap-hydrate", { currentUserId: activeId, users: byId.size });
  return true;
}

/** يُستدعى عند فتح /app — يحمّل الحالة من قاعدة البيانات على الخادم */
export async function bootstrapWebAppSession(): Promise<void> {
  if (typeof window === "undefined") return;
  runChatIsolationMigration();
  await ensureApiRuntimeConfig();
  if (!apiBackendEnabled()) return;
  await hydrateFromApiToken();
}
