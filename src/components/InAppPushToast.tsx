import { useEffect, useRef, useState } from "react";
import { Bell, X } from "lucide-react";
import type { InAppPushDetail } from "@/lib/pushNotifications";
import { routePushNotificationTap, type PushDeepLinkPayload } from "@/lib/pushDeepLink";
import { readNotificationPrefs } from "@/lib/notificationPrefs";

const TOAST_MS = 4500;

export function InAppPushToast() {
  const [visible, setVisible] = useState(false);
  const [payload, setPayload] = useState<InAppPushDetail | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onPush = (ev: Event) => {
      const detail = (ev as CustomEvent<InAppPushDetail>).detail;
      if (!detail?.title) return;
      setPayload(detail);
      setVisible(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        setVisible(false);
      }, TOAST_MS);
    };
    window.addEventListener("retweet-push-received", onPush);
    return () => {
      window.removeEventListener("retweet-push-received", onPush);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const dismiss = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setVisible(false);
  };

  const open = () => {
    if (payload?.data) {
      routePushNotificationTap(payload.data as PushDeepLinkPayload);
    }
    dismiss();
  };

  if (!visible || !payload) return null;
  if (!readNotificationPrefs().pushInAppToast) return null;

  return (
    <div
      className="fixed left-0 right-0 z-[110] max-w-md mx-auto w-full px-2 pointer-events-none"
      style={{ top: "calc(var(--sat, env(safe-area-inset-top, 0px)) + 4px)" }}
    >
      <div className="pointer-events-auto bg-card/95 backdrop-blur-md border border-border shadow-lg rounded-2xl px-3 py-2.5 flex items-start gap-2">
        <button
          type="button"
          className="flex-1 min-w-0 flex items-start gap-2 text-start"
          onClick={open}
        >
          <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center text-primary shrink-0">
            <Bell size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{payload.title}</p>
            {payload.body ? (
              <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{payload.body}</p>
            ) : null}
          </div>
        </button>
        <button
          type="button"
          className="p-1.5 rounded-full hover:bg-secondary shrink-0"
          aria-label="إغلاق"
          onClick={dismiss}
        >
          <X size={18} className="text-muted-foreground" />
        </button>
      </div>
    </div>
  );
}
