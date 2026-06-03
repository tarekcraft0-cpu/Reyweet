import { c as apiFetch } from "./index-D1S26om7.js";
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
  const authToken = (await import("./index-D1S26om7.js").then((n) => n.d)).getApiToken();
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
  const authToken = (await import("./index-D1S26om7.js").then((n) => n.d)).getApiToken();
  if (!authToken) return;
  await apiFetch("/v1/push/register", {
    method: "DELETE",
    token: authToken,
    body: JSON.stringify({ token })
  }).catch(() => void 0);
}
async function apiFetchPushStatus() {
  const authToken = (await import("./index-D1S26om7.js").then((n) => n.d)).getApiToken();
  if (!authToken) return null;
  const res = await apiFetch("/v1/push/status", { method: "GET", token: authToken });
  if (!res.ok) return null;
  return await res.json().catch(() => null);
}
async function apiSyncNotificationPrefs(prefs) {
  const authToken = (await import("./index-D1S26om7.js").then((n) => n.d)).getApiToken();
  if (!authToken) return false;
  const res = await apiFetch("/v1/push/prefs", {
    method: "PUT",
    token: authToken,
    body: JSON.stringify({
      ...prefs,
      messagePush: prefs.pushEnabled
    })
  });
  return res.ok;
}
async function apiFetchNotificationPrefsFromServer() {
  const authToken = (await import("./index-D1S26om7.js").then((n) => n.d)).getApiToken();
  if (!authToken) return null;
  const res = await apiFetch("/v1/push/prefs", { method: "GET", token: authToken });
  if (!res.ok) return null;
  const data = await res.json().catch(() => ({}));
  return data.prefs ?? null;
}
async function apiSendTestPush() {
  const authToken = (await import("./index-D1S26om7.js").then((n) => n.d)).getApiToken();
  if (!authToken) return { ok: false, error: "غير مسجّل" };
  const res = await apiFetch("/v1/push/send", {
    method: "POST",
    token: authToken,
    body: JSON.stringify({
      title: "Reyweet",
      body: "إشعار تجريبي — الإشعارات تعمل ✓",
      data: { type: "CUSTOM" }
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      ok: false,
      error: data.noTokens ? "لم يُسجَّل رمز الجهاز بعد — فعّل إذن الإشعارات ثم أعد المحاولة" : data.error || "تعذّر الإرسال"
    };
  }
  return { ok: !!data.success };
}
export {
  apiFetchNotificationPrefsFromServer,
  apiFetchPushStatus,
  apiRegisterPushToken,
  apiSendTestPush,
  apiSyncNotificationPrefs,
  apiUnregisterPushToken,
  getPushDeviceId
};
