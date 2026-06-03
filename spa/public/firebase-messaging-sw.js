/* Service Worker لـ FCM على الويب — يُحمَّل من /app/firebase-messaging-sw.js */
/* eslint-disable no-undef */

importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js");

let messaging = null;

function baseFromScope() {
  return self.registration.scope.replace(/\/?$/, "");
}

async function loadConfig() {
  const base = self.registration.scope.replace(/\/?$/, "/");
  const res = await fetch(`${base}/firebase-messaging-config.json`, { cache: "no-store" });
  if (!res.ok) throw new Error("missing firebase-messaging-config.json");
  return res.json();
}

loadConfig()
  .then(cfg => {
    if (!firebase.apps.length) {
      firebase.initializeApp(cfg);
    }
    messaging = firebase.messaging();
    function dTitle(p) {
      return (p.data && (p.data.title || p.data.notification_title)) || "";
    }
    function dBody(p) {
      return (p.data && (p.data.body || p.data.notification_body)) || "";
    }
    messaging.onBackgroundMessage(payload => {
      const d = payload.data || {};
      const title = payload.notification?.title || dTitle(payload) || "Reyweet";
      const body = payload.notification?.body || dBody(payload) || "";
      self.registration.showNotification(title, {
        body,
        icon: `${baseFromScope()}/favicon.png`,
        badge: `${baseFromScope()}/favicon.png`,
        tag: d.chatId ? `chat-${d.chatId}` : d.type || "retweet",
        renotify: true,
        data: {
          type: d.type || "MESSAGE",
          chatId: d.chatId || d.chat_id || "",
          fromId: d.fromId || d.senderId || "",
          postId: d.postId || "",
          storyId: d.storyId || "",
        },
      });
    });
  })
  .catch(err => {
    console.warn("[fcm-sw] init failed", err);
  });

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const data = event.notification?.data || {};
  const chatId = data.chatId || "";
  const type = data.type || "MESSAGE";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if ("focus" in client) {
          client.focus();
          client.postMessage({ type: "push_tap", ...data });
          return;
        }
      }
      if (clients.openWindow) {
        let url = baseFromScope();
        if (type === "MESSAGE" && chatId) {
          url = `${url}?openChat=${encodeURIComponent(chatId)}`;
        }
        return clients.openWindow(url);
      }
    }),
  );
});
