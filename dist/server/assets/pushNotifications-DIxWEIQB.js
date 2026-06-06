import { r as registerPlugin, b as routePushNotificationTap, i as isNativeCapacitorShell, c as readNotificationPrefs, e as emitUiToast, C as Capacitor } from "./index-HvwV1MnX.js";
import { apiUnregisterPushToken, apiRegisterPushToken } from "./pushApi-B0V3i341.js";
import "./server-C_9mn7Dm.js";
import "node:async_hooks";
import "node:stream/web";
import "node:stream";
import "fs";
import "url";
import "./worker-entry-zAIx4FeG.js";
import "node:events";
import "http";
import "https";
import "./router-Ey6aJVb3.js";
import "util";
import "stream";
import "zlib";
import "assert";
import "buffer";
const PushNotifications = registerPlugin("PushNotifications", {});
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
function bindNativePushListeners() {
  if (nativeListenersBound) return;
  nativeListenersBound = true;
  void PushNotifications.addListener("registration", (reg) => {
    const token = reg.value?.trim();
    if (!token) return;
    void registerToken(token, platformForNative(), true);
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
  return "unsupported";
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
    return { ok: true, state: "granted" };
  }
  emitUiToast("إشعارات الدفع متاحة في تطبيق iPhone فقط");
  return { ok: false, state: "unsupported" };
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
}
async function syncPushRegistration(force = false) {
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
async function initPushNotifications() {
  try {
    initNativePushDeliveryShell();
    if (!readNotificationPrefs().pushEnabled) return;
    if (!isNativeCapacitorShell()) return;
    await initNativePush();
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
