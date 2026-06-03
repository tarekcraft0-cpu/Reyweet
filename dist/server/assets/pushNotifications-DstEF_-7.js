import { r as registerPlugin, a as routePushNotificationTap, i as isNativeCapacitorShell, b as readNotificationPrefs, C as Capacitor, e as emitUiToast } from "./index-D1S26om7.js";
import { apiUnregisterPushToken, apiRegisterPushToken } from "./pushApi-Clx6jtmM.js";
import "./server-3EhgLyV0.js";
import "node:async_hooks";
import "node:stream/web";
import "node:stream";
import "fs";
import "url";
import "./worker-entry-8WRFKG0u.js";
import "node:events";
import "http";
import "https";
import "./router-DGvLW1uF.js";
import "util";
import "stream";
import "zlib";
import "assert";
import "buffer";
const PushNotifications = registerPlugin("PushNotifications", {});
function readFirebaseWebConfig() {
  return null;
}
function isFirebaseWebConfigured() {
  return readFirebaseWebConfig() !== null;
}
const STORAGE_KEY = "retweet_pending_push_tap_v1";
let memory = null;
function readStored() {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
function writeStored(data) {
  if (typeof window === "undefined") return;
  try {
    if (!data) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
  }
}
function stashPendingPushTap(data) {
  if (!data || typeof window === "undefined") return;
  const payload = {
    type: data.type,
    chatId: data.chatId || data.chat_id,
    chat_id: data.chat_id || data.chatId,
    fromId: data.fromId,
    postId: data.postId,
    storyId: data.storyId,
    userId: data.userId
  };
  memory = payload;
  writeStored(payload);
}
function consumePendingPushTap() {
  const payload = memory ?? readStored();
  if (!payload) return false;
  memory = null;
  writeStored(null);
  routePushNotificationTap(payload);
  return true;
}
const PERMISSION_ASKED_KEY = "retweet_push_permission_asked_v1";
const ANDROID_CHANNEL_ID = "retweet_high";
let nativeListenersBound = false;
let webMessagingBound = false;
let lastRegisteredToken = null;
let resumeBound = false;
let androidChannelReady = false;
function normalizePushData(raw) {
  if (!raw) return {};
  const data = { ...raw };
  if (!data.type && data.messageType) data.type = data.messageType;
  if (!data.chatId && data.chat_id) data.chatId = data.chat_id;
  if (!data.fromId && data.senderId) data.fromId = data.senderId;
  return data;
}
function dispatchInAppPush(detail) {
  if (typeof window === "undefined") return;
  if (document.visibilityState !== "visible") return;
  const prefs = readNotificationPrefs();
  if (!prefs.pushInAppToast) return;
  const type = String(detail.data?.type || "").toUpperCase();
  if (!prefs.mentionPush && type === "MENTION") return;
  if (!prefs.followPush && (type === "FOLLOW" || type === "FOLLOW_REQUEST")) return;
  window.dispatchEvent(new CustomEvent("retweet-push-received", { detail }));
}
function handlePushTap(data) {
  const normalized = normalizePushData(data);
  stashPendingPushTap(normalized);
  try {
    routePushNotificationTap(normalized);
  } catch {
  }
}
function platformForNative() {
  const p = Capacitor.getPlatform();
  if (p === "ios") return "ios";
  if (p === "android") return "android";
  return "web";
}
async function registerToken(token, platform, forceServer = false) {
  if (!token) return;
  if (!readNotificationPrefs().pushEnabled) return;
  if (!forceServer && token === lastRegisteredToken) return;
  const r = await apiRegisterPushToken(token, platform);
  if (r.ok) lastRegisteredToken = token;
}
async function ensureAndroidNotificationChannel() {
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
      lights: true
    });
    androidChannelReady = true;
  } catch (e) {
    console.warn("[push] android channel", e);
  }
}
async function syncIosFcmToken(force = false) {
  if (Capacitor.getPlatform() !== "ios") return;
  try {
    const w = window;
    if (w.__retweetNativeFcmToken) {
      await registerToken(w.__retweetNativeFcmToken, "ios", force);
      return;
    }
    w.__retweetSyncIosFcmToken?.();
    await new Promise((r) => setTimeout(r, 1200));
    if (w.__retweetNativeFcmToken) {
      await registerToken(w.__retweetNativeFcmToken, "ios", force);
    }
  } catch (e) {
    console.warn("[push] ios fcm token sync", e);
  }
}
function bindResumeSync() {
  if (resumeBound || typeof document === "undefined") return;
  resumeBound = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      void syncPushRegistration();
      void clearNativeBadge();
    }
  });
}
function bindNativeFcmTokenBridge() {
  if (typeof window === "undefined") return;
  const w = window;
  if (w.__retweetFcmBridgeBound) return;
  w.__retweetFcmBridgeBound = true;
  window.addEventListener("retweet-fcm-token", (ev) => {
    const token = ev.detail?.token?.trim();
    if (!token) return;
    window.__retweetNativeFcmToken = token;
    void registerToken(token, "ios", true);
  });
}
function bindNativePushListeners() {
  if (nativeListenersBound) return;
  nativeListenersBound = true;
  bindNativeFcmTokenBridge();
  void PushNotifications.addListener("registration", (reg) => {
    const token = reg.value?.trim();
    if (!token) return;
    void (async () => {
      if (Capacitor.getPlatform() === "ios") {
        await syncIosFcmToken(true);
        if (lastRegisteredToken) return;
      }
      await registerToken(token, platformForNative(), true);
    })();
  });
  void PushNotifications.addListener("registrationError", (err) => {
    console.warn("[push] native registration error", err);
  });
  void PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
    const data = normalizePushData(
      action.notification.data
    );
    handlePushTap(data);
  });
  void PushNotifications.addListener("pushNotificationReceived", (notification) => {
    const data = normalizePushData(notification.data || {});
    const title = notification.title?.trim() || String(data.title || data.notification_title || "Reyweet");
    const body = notification.body?.trim() || String(data.body || data.notification_body || "");
    if (document.visibilityState === "visible") {
      dispatchInAppPush({ title, body, data });
    }
  });
}
function initNativePushDeliveryShell() {
  if (!isNativeCapacitorShell()) return;
  bindNativePushListeners();
  bindResumeSync();
  void ensureAndroidNotificationChannel();
}
async function clearNativeBadge() {
  if (!isNativeCapacitorShell()) return;
  try {
    const delivered = await PushNotifications.getDeliveredNotifications();
    if (delivered.notifications.length > 0) {
      await PushNotifications.removeAllDeliveredNotifications();
    }
  } catch {
  }
}
async function getPushPermissionState() {
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
  if (!isFirebaseWebConfigured() || typeof window === "undefined") return "unsupported";
  if (!("Notification" in window)) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  return "prompt";
}
async function requestPushPermissionAndRegister() {
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
      }
      perm = await PushNotifications.requestPermissions();
    }
    if (perm.receive !== "granted") {
      return { ok: false, state: perm.receive === "denied" ? "denied" : "prompt" };
    }
    lastRegisteredToken = null;
    await PushNotifications.register();
    if (Capacitor.getPlatform() === "ios") await syncIosFcmToken(true);
    return { ok: true, state: "granted" };
  }
  if (!isFirebaseWebConfigured()) {
    emitUiToast("إشعارات الويب غير مُعدّة على الخادم");
    return { ok: false, state: "unsupported" };
  }
  if (typeof window !== "undefined" && "Notification" in window) {
    if (Notification.permission === "default") {
      try {
        localStorage.setItem(PERMISSION_ASKED_KEY, "1");
      } catch {
      }
      const p = await Notification.requestPermission();
      if (p !== "granted") return { ok: false, state: p === "denied" ? "denied" : "prompt" };
    } else if (Notification.permission === "denied") {
      return { ok: false, state: "denied" };
    }
  }
  lastRegisteredToken = null;
  await initWebPush();
  const state = await getPushPermissionState();
  return { ok: state === "granted" && !!lastRegisteredToken, state };
}
async function initNativePush() {
  if (!isNativeCapacitorShell()) return;
  initNativePushDeliveryShell();
  let perm = await PushNotifications.checkPermissions();
  if (perm.receive === "prompt") {
    try {
      if (!localStorage.getItem(PERMISSION_ASKED_KEY)) {
        localStorage.setItem(PERMISSION_ASKED_KEY, "1");
      }
    } catch {
    }
    perm = await PushNotifications.requestPermissions();
  }
  if (perm.receive !== "granted") return;
  await PushNotifications.register();
  if (Capacitor.getPlatform() === "ios") await syncIosFcmToken(true);
}
async function initWebPush() {
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
    }
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return;
  } else if (Notification.permission !== "granted") {
    return;
  }
  const { initializeApp, getApps } = await import("./index.esm-CrSwngUQ.js");
  const { getMessaging, getToken, onMessage, isSupported } = await import("./index.esm-CM5rD4SC.js");
  if (!await isSupported()) return;
  const app = getApps()[0] ?? initializeApp(cfg);
  const messaging = getMessaging(app);
  const swPath = `${"/"}firebase-messaging-sw.js`.replace(
    "//",
    "/"
  );
  const swUrl = new URL(swPath, window.location.origin).href;
  const registration = await navigator.serviceWorker.register(swUrl, {
    scope: "/"
  });
  await navigator.serviceWorker.ready;
  const token = await getToken(messaging, {
    vapidKey: cfg.vapidKey,
    serviceWorkerRegistration: registration
  });
  if (token) await registerToken(token, "web", true);
  if (!webMessagingBound) {
    webMessagingBound = true;
    onMessage(messaging, (payload) => {
      const data = normalizePushData(payload.data);
      const title = payload.notification?.title || String(data?.title || "Reyweet");
      const body = payload.notification?.body || String(data?.body || "");
      if (document.visibilityState === "visible") {
        dispatchInAppPush({ title, body, data });
        return;
      }
      if (Notification.permission === "granted") {
        const n = new Notification(title, { body, data });
        n.onclick = () => {
          handlePushTap(data);
          n.close();
        };
      }
    });
  }
  navigator.serviceWorker.addEventListener("message", (ev) => {
    const msg = ev.data;
    if (!msg) return;
    if (msg.type === "open_chat" && msg.chatId) {
      handlePushTap({ type: "MESSAGE", chatId: msg.chatId });
      return;
    }
    if (msg.type === "open_push" || msg.type === "push_tap") {
      handlePushTap(msg);
    }
  });
  bindResumeSync();
}
async function syncPushRegistration(force = false) {
  try {
    if (!readNotificationPrefs().pushEnabled) return;
    if (isNativeCapacitorShell()) {
      const perm = await PushNotifications.checkPermissions();
      if (perm.receive !== "granted") return;
      if (force) lastRegisteredToken = null;
      await PushNotifications.register();
      if (Capacitor.getPlatform() === "ios") await syncIosFcmToken(force);
      return;
    }
    if (force) lastRegisteredToken = null;
    await initWebPush();
  } catch (e) {
    console.warn("[push] sync failed", e);
  }
}
async function initPushNotifications() {
  try {
    initNativePushDeliveryShell();
    if (!readNotificationPrefs().pushEnabled) return;
    if (isNativeCapacitorShell()) {
      await initNativePush();
      return;
    }
    await initWebPush();
  } catch (e) {
    console.warn("[push] init failed", e);
  }
}
async function teardownPushNotifications() {
  if (lastRegisteredToken) {
    await apiUnregisterPushToken(lastRegisteredToken);
    lastRegisteredToken = null;
  }
}
export {
  clearNativeBadge,
  consumePendingPushTap,
  getPushPermissionState,
  initNativePushDeliveryShell,
  initPushNotifications,
  requestPushPermissionAndRegister,
  syncPushRegistration,
  teardownPushNotifications
};
