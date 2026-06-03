import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { isNativeCapacitorShell } from "./apiUrlPolicy";
import { apiRegisterPushToken, apiUnregisterPushToken, type PushPlatform } from "./pushApi";
import { routePushNotificationTap, type PushDeepLinkPayload } from "./pushDeepLink";
import { readNotificationPrefs } from "./notificationPrefs";
import { emitUiToast } from "./uiToast";
import { consumePendingPushTap, stashPendingPushTap } from "./pendingPushTap";

const PERMISSION_ASKED_KEY = "retweet_push_permission_asked_v1";
const ANDROID_CHANNEL_ID = "retweet_high";
let nativeListenersBound = false;
let lastRegisteredToken: string | null = null;
let resumeBound = false;
let androidChannelReady = false;

export type PushPermissionState = "granted" | "denied" | "prompt" | "unsupported";

export type InAppPushDetail = {
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

function normalizePushData(raw?: Record<string, unknown>): Record<string, unknown> {
  if (!raw) return {};
  const data = { ...raw };
  if (!data.type && data.messageType) data.type = data.messageType;
  if (!data.chatId && data.chat_id) data.chatId = data.chat_id;
  if (!data.fromId && data.senderId) data.fromId = data.senderId;
  return data;
}

function dispatchInAppPush(detail: InAppPushDetail): void {
  if (typeof window === "undefined") return;
  if (document.visibilityState !== "visible") return;
  const prefs = readNotificationPrefs();
  if (!prefs.pushInAppToast) return;
  const type = String(detail.data?.type || "").toUpperCase();
  if (!prefs.mentionPush && type === "MENTION") return;
  if (!prefs.followPush && (type === "FOLLOW" || type === "FOLLOW_REQUEST")) return;
  window.dispatchEvent(new CustomEvent("retweet-push-received", { detail }));
}

function handlePushTap(data?: Record<string, unknown>): void {
  const normalized = normalizePushData(data);
  stashPendingPushTap(normalized as PushDeepLinkPayload);
  try {
    routePushNotificationTap(normalized as PushDeepLinkPayload);
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

async function registerToken(
  token: string,
  platform: PushPlatform,
  forceServer = false,
): Promise<void> {
  if (!token) return;
  if (!readNotificationPrefs().pushEnabled) return;
  if (!forceServer && token === lastRegisteredToken) return;
  const r = await apiRegisterPushToken(token, platform);
  if (r.ok) lastRegisteredToken = token;
}

async function ensureAndroidNotificationChannel(): Promise<void> {
  if (Capacitor.getPlatform() !== "android" || androidChannelReady) return;
  try {
    await PushNotifications.createChannel({
      id: ANDROID_CHANNEL_ID,
      name: "رسائل وتنبيهات",
      description: "إشعارات Reyweet عند الرسائل والتفاعلات",
      importance: 5,
      visibility: 1,
      sound: "default",
      vibration: true,
      lights: true,
    });
    androidChannelReady = true;
  } catch (e) {
    console.warn("[push] android channel", e);
  }
}

function bindResumeSync(): void {
  if (resumeBound || typeof document === "undefined") return;
  resumeBound = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      void syncPushRegistration();
      void clearNativeBadge();
    }
  });
}

function bindNativePushListeners(): void {
  if (nativeListenersBound) return;
  nativeListenersBound = true;

  void PushNotifications.addListener("registration", reg => {
    const token = reg.value?.trim();
    if (!token) return;
    void registerToken(token, platformForNative(), true);
  });

  void PushNotifications.addListener("registrationError", err => {
    console.warn("[push] native registration error", err);
  });

  void PushNotifications.addListener("pushNotificationActionPerformed", action => {
    const data = normalizePushData(
      action.notification.data as Record<string, unknown> | undefined,
    );
    handlePushTap(data);
  });

  void PushNotifications.addListener("pushNotificationReceived", notification => {
    const data = normalizePushData((notification.data || {}) as Record<string, unknown>);
    const title =
      notification.title?.trim() ||
      String(data.title || data.notification_title || "Reyweet");
    const body =
      notification.body?.trim() ||
      String(data.body || data.notification_body || "");
    if (document.visibilityState === "visible") {
      dispatchInAppPush({ title, body, data });
    }
  });
}

/** ربط مستمعي النقر/الاستقبال — يعمل حتى خارج التطبيق (بعد فتحه من الإشعار) */
export function initNativePushDeliveryShell(): void {
  if (!isNativeCapacitorShell()) return;
  bindNativePushListeners();
  bindResumeSync();
  void ensureAndroidNotificationChannel();
}

export async function clearNativeBadge(): Promise<void> {
  if (!isNativeCapacitorShell()) return;
  try {
    const delivered = await PushNotifications.getDeliveredNotifications();
    if (delivered.notifications.length > 0) {
      await PushNotifications.removeAllDeliveredNotifications();
    }
  } catch {
    /* ignore */
  }
}

export async function getPushPermissionState(): Promise<PushPermissionState> {
  if (isNativeCapacitorShell()) {
    try {
      const perm = await PushNotifications.checkPermissions();
      if (perm.receive === "granted") return "granted";
      if (perm.receive === "denied") return "denied";
      return "prompt";
    } catch {
      return "unsupported";
    }
  }
  return "unsupported";
}

/** طلب إذن النظام وتسجيل التوكن — يُستدعى عند تفعيل الإشعارات من الإعدادات */
export async function requestPushPermissionAndRegister(): Promise<{
  ok: boolean;
  state: PushPermissionState;
}> {
  initNativePushDeliveryShell();
  if (!readNotificationPrefs().pushEnabled) {
    return { ok: false, state: await getPushPermissionState() };
  }

  if (isNativeCapacitorShell()) {
    await ensureAndroidNotificationChannel();
    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === "prompt") {
      try {
        localStorage.setItem(PERMISSION_ASKED_KEY, "1");
      } catch {
        /* ignore */
      }
      perm = await PushNotifications.requestPermissions();
    }
    if (perm.receive !== "granted") {
      return { ok: false, state: perm.receive === "denied" ? "denied" : "prompt" };
    }
    lastRegisteredToken = null;
    await PushNotifications.register();
    return { ok: true, state: "granted" };
  }

  emitUiToast("إشعارات الدفع متاحة في تطبيق iPhone فقط");
  return { ok: false, state: "unsupported" };
}

async function initNativePush(): Promise<void> {
  if (!isNativeCapacitorShell()) return;
  initNativePushDeliveryShell();

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

/** إعادة تسجيل توكن APNs على الخادم */
export async function syncPushRegistration(force = false): Promise<void> {
  try {
    if (!readNotificationPrefs().pushEnabled) return;
    if (!isNativeCapacitorShell()) return;
    const perm = await PushNotifications.checkPermissions();
    if (perm.receive !== "granted") return;
    if (force) lastRegisteredToken = null;
    await PushNotifications.register();
  } catch (e) {
    console.warn("[push] sync failed", e);
  }
}

export async function initPushNotifications(): Promise<void> {
  try {
    initNativePushDeliveryShell();
    if (!readNotificationPrefs().pushEnabled) return;
    if (!isNativeCapacitorShell()) return;
    await initNativePush();
  } catch (e) {
    console.warn("[push] init failed", e);
  }
}

/** إلغاء التوكن من الخادم فقط */
export async function teardownPushNotifications(): Promise<void> {
  if (lastRegisteredToken) {
    await apiUnregisterPushToken(lastRegisteredToken);
    lastRegisteredToken = null;
  }
}

export { consumePendingPushTap };
