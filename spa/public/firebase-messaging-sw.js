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
    messaging.onBackgroundMessage(payload => {
      const title = payload.notification?.title || "Retweet";
      const body = payload.notification?.body || "";
      const chatId = payload.data?.chatId || "";
      self.registration.showNotification(title, {
        body,
        icon: `${baseFromScope()}/favicon.png`,
        data: { chatId, type: payload.data?.type || "message" },
      });
    });
  })
  .catch(err => {
    console.warn("[fcm-sw] init failed", err);
  });

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const chatId = event.notification?.data?.chatId;
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if ("focus" in client) {
          client.focus();
          client.postMessage({ type: "open_chat", chatId });
          return;
        }
      }
      if (clients.openWindow) {
        const url = chatId ? `${baseFromScope()}?openChat=${encodeURIComponent(chatId)}` : baseFromScope();
        return clients.openWindow(url);
      }
    }),
  );
});
