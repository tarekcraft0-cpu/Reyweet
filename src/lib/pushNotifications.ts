import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { isNativeCapacitorShell } from "./apiUrlPolicy";
import { apiRegisterPushToken, apiUnregisterPushToken, type PushPlatform } from "./pushApi";
import { isFirebaseWebConfigured, readFirebaseWebConfig } from "./firebaseClient";
import { routePushNotificationTap, type PushDeepLinkPayload } from "./pushDeepLink";

const PERMISSION_ASKED_KEY = "retweet_push_permission_asked_v1";
let nativeListenersBound = false;
let webMessagingBound = false;
let lastRegisteredToken: string | null = null;

function openFromPayload(data?: Record<string, unknown>): void {
  try {
    routePushNotificationTap(data as PushDeepLinkPayload);
  } catch {
    /* ignore */
  }
}

function platformForNative(): PushPlatform {
  const p = Capacitor.getPlatform();
  if (p === "ios") return "ios";
  if (p === "android") return "android";
  return "web";
}

async function registerToken(token: string, platform: PushPlatform): Promise<void> {
  if (!token || token === lastRegisteredToken) return;
  const r = await apiRegisterPushToken(token, platform);
  if (r.ok) lastRegisteredToken = token;
}

function bindNativePushListeners(): void {
  if (nativeListenersBound) return;
  nativeListenersBound = true;

  void PushNotifications.addListener("registration", reg => {
    const token = reg.value?.trim();
    if (token) void registerToken(token, platformForNative());
  });

  void PushNotifications.addListener("registrationError", err => {
    console.warn("[push] native registration error", err);
  });

  void PushNotifications.addListener("pushNotificationActionPerformed", action => {
    const data = action.notification.data as Record<string, unknown> | undefined;
    openFromPayload(data);
  });

  void PushNotifications.addListener("pushNotificationReceived", notification => {
    const data = notification.data as Record<string, unknown> | undefined;
    const t = String(data?.type || "").toUpperCase();
    if (document.visibilityState === "visible" && (t === "MESSAGE" || t === "message")) {
      return;
    }
  });
}

async function initNativePush(): Promise<void> {
  if (!isNativeCapacitorShell()) return;
  bindNativePushListeners();

  let perm = await PushNotifications.checkPermissions();
  if (perm.receive === "prompt") {
    try {
      if (!localStorage.getItem(PERMISSION_ASKED_KEY)) {
        localStorage.setItem(PERMISSION_ASKED_KEY, "1");
      }
    } catch {
      /* ignore */
    }
    perm = await PushNotifications.requestPermissions();
  }
  if (perm.receive !== "granted") return;

  await PushNotifications.register();
}

async function initWebPush(): Promise<void> {
  if (!isFirebaseWebConfigured() || typeof window === "undefined") return;
  if (!("Notification" in window) || !("serviceWorker" in navigator)) return;

  const cfg = readFirebaseWebConfig();
  if (!cfg) return;

  if (Notification.permission === "default") {
    try {
      if (!localStorage.getItem(PERMISSION_ASKED_KEY)) {
        localStorage.setItem(PERMISSION_ASKED_KEY, "1");
      }
    } catch {
      /* ignore */
    }
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return;
  } else if (Notification.permission !== "granted") {
    return;
  }

  const { initializeApp, getApps } = await import("firebase/app");
  const { getMessaging, getToken, onMessage, isSupported } = await import("firebase/messaging");

  if (!(await isSupported())) return;

  const app = getApps()[0] ?? initializeApp(cfg);
  const messaging = getMessaging(app);

  const swPath = `${import.meta.env.BASE_URL || "/app/"}firebase-messaging-sw.js`.replace(
    "//",
    "/",
  );
  const swUrl = new URL(swPath, window.location.origin).href;
  const registration = await navigator.serviceWorker.register(swUrl, {
    scope: import.meta.env.BASE_URL || "/app/",
  });

  await navigator.serviceWorker.ready;

  const token = await getToken(messaging, {
    vapidKey: cfg.vapidKey,
    serviceWorkerRegistration: registration,
  });
  if (token) await registerToken(token, "web");

  if (!webMessagingBound) {
    webMessagingBound = true;
    onMessage(messaging, payload => {
      if (document.visibilityState === "visible") return;
      const data = payload.data as Record<string, unknown> | undefined;
      const title = payload.notification?.title || "رسالة جديدة";
      const body = payload.notification?.body || "";
      if (Notification.permission === "granted") {
        const n = new Notification(title, { body, data: data as NotificationOptions["data"] });
        n.onclick = () => {
          openFromPayload(data);
          n.close();
        };
      }
    });
  }

  navigator.serviceWorker.addEventListener("message", ev => {
    const msg = ev.data as PushDeepLinkPayload & { type?: string } | undefined;
    if (!msg) return;
    if (msg.type === "open_chat" && msg.chatId) {
      openFromPayload({ type: "MESSAGE", chatId: msg.chatId });
      return;
    }
    if (msg.type === "open_push" || msg.type === "push_tap") {
      openFromPayload(msg);
    }
  });
}

/** يُستدعى بعد تسجيل الدخول — يطلب الإذن أول مرة ويسجّل FCM token */
export async function initPushNotifications(): Promise<void> {
  try {
    if (isNativeCapacitorShell()) {
      await initNativePush();
      return;
    }
    await initWebPush();
  } catch (e) {
    console.warn("[push] init failed", e);
  }
}

export async function teardownPushNotifications(): Promise<void> {
  if (lastRegisteredToken) {
    await apiUnregisterPushToken(lastRegisteredToken);
    lastRegisteredToken = null;
  }
  if (isNativeCapacitorShell()) {
    try {
      await PushNotifications.removeAllListeners();
    } catch {
      /* ignore */
    }
    nativeListenersBound = false;
  }
}
