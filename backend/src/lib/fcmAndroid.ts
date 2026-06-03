/**
 * إشعارات Android عبر FCM (اختياري — يُفعَّل عند وجود مفاتيح Firebase على VPS).
 */
function env(key: string): string {
  return (process.env[key] || "").trim();
}

export function isFcmAndroidConfigured(): boolean {
  if (env("FIREBASE_SERVICE_ACCOUNT_JSON")) return true;
  return !!(env("FIREBASE_PROJECT_ID") && env("FIREBASE_CLIENT_EMAIL") && env("FIREBASE_PRIVATE_KEY"));
}

let messagingPromise: Promise<import("firebase-admin/messaging").Messaging> | null = null;

async function getMessaging(): Promise<import("firebase-admin/messaging").Messaging> {
  if (!messagingPromise) {
    messagingPromise = (async () => {
      const { getApps, initializeApp, cert } = await import("firebase-admin/app");
      const { getMessaging } = await import("firebase-admin/messaging");
      if (!getApps().length) {
        const json = env("FIREBASE_SERVICE_ACCOUNT_JSON");
        if (json) {
          initializeApp({
            credential: cert(JSON.parse(json) as Parameters<typeof cert>[0]),
          });
        } else {
          const projectId = env("FIREBASE_PROJECT_ID");
          const clientEmail = env("FIREBASE_CLIENT_EMAIL");
          const privateKey = env("FIREBASE_PRIVATE_KEY").replace(/\\n/g, "\n");
          if (!projectId || !clientEmail || !privateKey) {
            throw new Error("Firebase credentials missing for Android FCM");
          }
          initializeApp({
            credential: cert({ projectId, clientEmail, privateKey } as Parameters<typeof cert>[0]),
          });
        }
      }
      return getMessaging();
    })();
  }
  return messagingPromise;
}

export async function sendFcmToDevice(
  token: string,
  title: string,
  body: string,
  data: Record<string, string> = {},
): Promise<{ ok: boolean; unregistered?: boolean }> {
  if (!isFcmAndroidConfigured()) return { ok: false };
  try {
    const messaging = await getMessaging();
    const id = await messaging.send({
      token,
      notification: { title, body },
      data: Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, String(v ?? "")]),
      ),
      android: {
        priority: "high",
        notification: { channelId: "retweet_high", sound: "default" },
      },
    });
    return { ok: !!id };
  } catch (e: unknown) {
    const code = (e as { code?: string })?.code || "";
    if (code === "messaging/registration-token-not-registered") {
      return { ok: false, unregistered: true };
    }
    console.warn("[push] FCM send failed", e);
    return { ok: false };
  }
}
