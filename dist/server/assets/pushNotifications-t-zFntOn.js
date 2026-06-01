import { r as registerPlugin, a as apiFetch, i as isNativeCapacitorShell, b as routePushNotificationTap, C as Capacitor } from "./index-BHeH3hSP.js";
import "./server-DIVRA65s.js";
import "node:async_hooks";
import "node:stream/web";
import "node:stream";
import "fs";
import "url";
import "./worker-entry-3m3-SK4o.js";
import "node:events";
import "http";
import "https";
import "./router-BdP_5x1M.js";
import "util";
import "stream";
import "zlib";
import "assert";
import "buffer";
const PushNotifications = registerPlugin("PushNotifications", {});
const DEVICE_ID_KEY = "retweet_device_id_v1";
function getPushDeviceId() {
  if (typeof window === "undefined") return "server";
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `d_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return `ephemeral_${Date.now()}`;
  }
}
async function apiRegisterPushToken(token, platform) {
  const authToken = (await import("./index-BHeH3hSP.js").then((n) => n.c)).getApiToken();
  if (!authToken) return { ok: false, error: "غير مسجّل" };
  const res = await apiFetch("/v1/push/register", {
    method: "POST",
    token: authToken,
    body: JSON.stringify({
      token,
      platform,
      deviceId: getPushDeviceId()
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: data.error || "تعذر حفظ رمز الإشعار" };
  return { ok: true };
}
async function apiUnregisterPushToken(token) {
  const authToken = (await import("./index-BHeH3hSP.js").then((n) => n.c)).getApiToken();
  if (!authToken) return;
  await apiFetch("/v1/push/register", {
    method: "DELETE",
    token: authToken,
    body: JSON.stringify({ token })
  }).catch(() => void 0);
}
function readFirebaseWebConfig() {
  return null;
}
function isFirebaseWebConfigured() {
  return readFirebaseWebConfig() !== null;
}
const PERMISSION_ASKED_KEY = "retweet_push_permission_asked_v1";
let nativeListenersBound = false;
let webMessagingBound = false;
let lastRegisteredToken = null;
let resumeBound = false;
function dispatchInAppPush(detail) {
  if (typeof window === "undefined") return;
  if (document.visibilityState !== "visible") return;
  window.dispatchEvent(new CustomEvent("retweet-push-received", { detail }));
}
function openFromPayload(data) {
  try {
    routePushNotificationTap(data);
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
  if (!forceServer && token === lastRegisteredToken) return;
  const r = await apiRegisterPushToken(token, platform);
  if (r.ok) lastRegisteredToken = token;
}
function bindResumeSync() {
  if (resumeBound || typeof document === "undefined") return;
  resumeBound = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void syncPushRegistration();
  });
}
function bindNativePushListeners() {
  if (nativeListenersBound) return;
  nativeListenersBound = true;
  void PushNotifications.addListener("registration", (reg) => {
    const token = reg.value?.trim();
    if (token) void registerToken(token, platformForNative(), true);
  });
  void PushNotifications.addListener("registrationError", (err) => {
    console.warn("[push] native registration error", err);
  });
  void PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
    const data = action.notification.data;
    openFromPayload(data);
  });
  void PushNotifications.addListener("pushNotificationReceived", (notification) => {
    const data = notification.data || {};
    const title = notification.title?.trim() || String(data.title || data.notification_title || "Reyweet");
    const body = notification.body?.trim() || String(data.body || data.notification_body || "");
    dispatchInAppPush({ title, body, data });
  });
}
async function initNativePush() {
  if (!isNativeCapacitorShell()) return;
  bindNativePushListeners();
  bindResumeSync();
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
      const data = payload.data;
      const title = payload.notification?.title || String(data?.title || "Reyweet");
      const body = payload.notification?.body || String(data?.body || "");
      if (document.visibilityState === "visible") {
        dispatchInAppPush({ title, body, data });
        return;
      }
      if (Notification.permission === "granted") {
        const n = new Notification(title, { body, data });
        n.onclick = () => {
          openFromPayload(data);
          n.close();
        };
      }
    });
  }
  navigator.serviceWorker.addEventListener("message", (ev) => {
    const msg = ev.data;
    if (!msg) return;
    if (msg.type === "open_chat" && msg.chatId) {
      openFromPayload({ type: "MESSAGE", chatId: msg.chatId });
      return;
    }
    if (msg.type === "open_push" || msg.type === "push_tap") {
      openFromPayload(msg);
    }
  });
  bindResumeSync();
}
async function syncPushRegistration(force = false) {
  try {
    if (isNativeCapacitorShell()) {
      const perm = await PushNotifications.checkPermissions();
      if (perm.receive !== "granted") return;
      if (force) lastRegisteredToken = null;
      await PushNotifications.register();
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
  if (isNativeCapacitorShell()) {
    try {
      await PushNotifications.removeAllListeners();
    } catch {
    }
    nativeListenersBound = false;
  }
}
export {
  initPushNotifications,
  syncPushRegistration,
  teardownPushNotifications
};
