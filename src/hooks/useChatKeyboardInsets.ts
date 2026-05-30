import { useEffect, useRef, useState } from "react";
import { mountChatKeyboardEngine, readChatKeyboardSnapshot, type ChatKeyboardSnapshot } from "@/lib/chatKeyboardInsets";

function snapChanged(a: ChatKeyboardSnapshot, b: ChatKeyboardSnapshot): boolean {
  return a.open !== b.open || Math.abs(a.keyboardInset - b.keyboardInset) > 2;
}

/** حالة الكيبورد للمحادثة — يُفعّل محرك CSS عند mount */
export function useChatKeyboardInsets(enabled: boolean): ChatKeyboardSnapshot {
  const [snap, setSnap] = useState(readChatKeyboardSnapshot);
  const lastRef = useRef(snap);

  useEffect(() => {
    if (!enabled) return;
    const unmountEngine = mountChatKeyboardEngine();
    const apply = () => {
      const next = readChatKeyboardSnapshot();
      if (!snapChanged(lastRef.current, next)) return;
      lastRef.current = next;
      setSnap(next);
    };
    apply();
    const vv = window.visualViewport;
    vv?.addEventListener("resize", apply, { passive: true });
    vv?.addEventListener("scroll", apply, { passive: true });
    window.addEventListener("retweet-chat-keyboard-sync", apply);
    return () => {
      vv?.removeEventListener("resize", apply);
      vv?.removeEventListener("scroll", apply);
      window.removeEventListener("retweet-chat-keyboard-sync", apply);
      unmountEngine();
    };
  }, [enabled]);

  return snap;
}
