import { useEffect, useState } from "react";
import { mountChatKeyboardEngine, readChatKeyboardSnapshot, type ChatKeyboardSnapshot } from "@/lib/chatKeyboardInsets";

/** حالة الكيبورد للمحادثة — يُفعّل محرك CSS عند mount */
export function useChatKeyboardInsets(enabled: boolean): ChatKeyboardSnapshot {
  const [snap, setSnap] = useState(readChatKeyboardSnapshot);

  useEffect(() => {
    if (!enabled) return;
    const unmountEngine = mountChatKeyboardEngine();
    const sync = () => setSnap(readChatKeyboardSnapshot());
    sync();
    const vv = window.visualViewport;
    vv?.addEventListener("resize", sync, { passive: true });
    vv?.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("retweet-chat-keyboard-sync", sync);
    return () => {
      vv?.removeEventListener("resize", sync);
      vv?.removeEventListener("scroll", sync);
      window.removeEventListener("retweet-chat-keyboard-sync", sync);
      unmountEngine();
    };
  }, [enabled]);

  return snap;
}
