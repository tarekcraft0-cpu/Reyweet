import { useEffect, useRef, useState } from "react";
import { useApp, userById } from "@/lib/store";
import type { Notification } from "@/lib/types";
import { MessageCircle, X } from "lucide-react";

const DM_TOAST_MS = 2000;

export function NotificationBanner() {
  const { state, currentUser, markNotificationRead } = useApp();
  const [visible, setVisible] = useState(false);
  const [active, setActive] = useState<Notification | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const me = currentUser?.id;

  const topDm = (() => {
    if (!me) return undefined;
    const list = state.notifications.filter(n => n.userId === me && !n.read && n.type === "message" && n.chatId);
    list.sort((a, b) => b.createdAt - a.createdAt);
    return list[0];
  })();

  useEffect(() => {
    if (!me) return;
    if (!topDm) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setActive(null);
      setVisible(false);
      return;
    }
    setActive(topDm);
    setVisible(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setVisible(false);
    }, DM_TOAST_MS);
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [topDm?.id, topDm?.createdAt, me]);

  const dismiss = (markRead: boolean) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (markRead && active) markNotificationRead(active.id);
    setVisible(false);
  };

  const openChat = () => {
    if (!active?.chatId) return;
    markNotificationRead(active.id);
    try {
      window.dispatchEvent(new CustomEvent("retweet-open-chat", { detail: { chatId: active.chatId } }));
    } catch {
      /* ignore */
    }
    setVisible(false);
    setActive(null);
  };

  if (!visible || !active || active.type !== "message") return null;

  const from = userById(state, active.fromId);
  const preview = (active.text || "").trim() || "رسالة جديدة";

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] max-w-md mx-auto w-full bg-card/95 backdrop-blur-md border-b border-border shadow-lg px-2 py-2 flex items-start gap-1 supports-[padding:max(0px)]:pt-[max(0.25rem,var(--sat))]">
      <button
        type="button"
        className="flex-1 min-w-0 flex items-start gap-2 text-start py-1 ps-1 rounded-xl hover:bg-secondary/60 active:bg-secondary/80 transition-colors"
        onClick={openChat}
      >
        <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center text-primary shrink-0 mt-0.5">
          <MessageCircle size={18} />
        </div>
        <div className="flex-1 min-w-0 pt-0.5">
          <p className="text-sm font-semibold truncate">
            @{from?.username || "…"} أرسل لك رسالة
          </p>
          <p className="text-xs text-muted-foreground line-clamp-3 break-words whitespace-pre-wrap mt-0.5">
            {preview}
          </p>
        </div>
      </button>
      <button
        type="button"
        className="p-2 rounded-full hover:bg-secondary shrink-0 self-start"
        aria-label="إغلاق"
        onClick={() => dismiss(true)}
      >
        <X size={18} className="text-muted-foreground" />
      </button>
    </div>
  );
}
