export type NotificationPrefs = {
  pushEnabled: boolean;
  dmInAppBanner: boolean;
  pushInAppToast: boolean;
  mentionPush: boolean;
  followPush: boolean;
};

const KEY = "retweet_notification_prefs_v1";

const DEFAULT_PREFS: NotificationPrefs = {
  pushEnabled: true,
  dmInAppBanner: true,
  pushInAppToast: true,
  mentionPush: true,
  followPush: true,
};

export function readNotificationPrefs(): NotificationPrefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<NotificationPrefs>;
    return {
      pushEnabled: parsed.pushEnabled !== false,
      dmInAppBanner: parsed.dmInAppBanner !== false,
      pushInAppToast: parsed.pushInAppToast !== false,
      mentionPush: parsed.mentionPush !== false,
      followPush: parsed.followPush !== false,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function writeNotificationPrefs(next: NotificationPrefs): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent("retweet-notification-prefs-changed", { detail: next }));
  } catch {
    /* ignore storage failures */
  }
}

export function updateNotificationPrefs(patch: Partial<NotificationPrefs>): NotificationPrefs {
  const next = { ...readNotificationPrefs(), ...patch };
  writeNotificationPrefs(next);
  void import("./pushApi").then(m => m.apiSyncNotificationPrefs(next));
  return next;
}

/** دمج تفضيلات الخادم مع المحلية بعد تسجيل الدخول */
export function mergeServerNotificationPrefs(server: Partial<NotificationPrefs>): NotificationPrefs {
  const local = readNotificationPrefs();
  const next: NotificationPrefs = {
    pushEnabled: server.pushEnabled ?? local.pushEnabled,
    dmInAppBanner: server.dmInAppBanner ?? local.dmInAppBanner,
    pushInAppToast: server.pushInAppToast ?? local.pushInAppToast,
    mentionPush: server.mentionPush ?? local.mentionPush,
    followPush: server.followPush ?? local.followPush,
  };
  writeNotificationPrefs(next);
  return next;
}

export async function hydrateNotificationPrefsFromServer(): Promise<void> {
  try {
    const { apiFetchNotificationPrefsFromServer } = await import("./pushApi");
    const remote = await apiFetchNotificationPrefsFromServer();
    if (remote) mergeServerNotificationPrefs(remote);
  } catch {
    /* ignore */
  }
}

