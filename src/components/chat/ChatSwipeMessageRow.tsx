import { useCallback, useRef, useState } from "react";
import { Reply } from "lucide-react";
import { Avatar } from "../Avatar";
import type { Message } from "@/lib/types";

const SWIPE_THRESHOLD = 48;
const SWIPE_MAX = 76;

/**
 * محاذاة فيزيائية ثابتة (لا تعتمد على RTL الصفحة):
 * - رسائلي: يمين الشاشة، بدون أفاتار
 * - الطرف الآخر: يسار الشاشة، مع أفاتار
 */
export function ChatSwipeMessageRow({
  message,
  mine,
  avatarName,
  avatarSrc,
  isQuran,
  children,
  onSwipeReply,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  mine: boolean;
  avatarName?: string;
  avatarSrc?: string;
  isQuran: boolean;
  children: React.ReactNode;
  onSwipeReply: () => void;
  onPointerDown: (e: React.PointerEvent, m: Message) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent, m: Message) => void;
  message: Message;
}) {
  const [dragX, setDragX] = useState(0);
  const swipeRef = useRef<{ x: number; y: number; active: boolean } | null>(null);

  const handleDown = useCallback(
    (e: React.PointerEvent) => {
      swipeRef.current = { x: e.clientX, y: e.clientY, active: true };
      setDragX(0);
      onPointerDown(e, message);
    },
    [message, onPointerDown],
  );

  const handleMove = useCallback(
    (e: React.PointerEvent) => {
      const s = swipeRef.current;
      if (s?.active) {
        const dx = e.clientX - s.x;
        const dy = e.clientY - s.y;
        if (dx > 6 && Math.abs(dx) > Math.abs(dy) * 1.1) {
          setDragX(Math.min(SWIPE_MAX, dx * 0.92));
        } else if (Math.abs(dy) > 18) {
          swipeRef.current = { ...s, active: false };
          setDragX(0);
        }
      }
      onPointerMove(e);
    },
    [onPointerMove],
  );

  const handleUp = useCallback(
    (e: React.PointerEvent) => {
      const dx = dragX;
      if (dx >= SWIPE_THRESHOLD) onSwipeReply();
      setDragX(0);
      swipeRef.current = null;
      onPointerUp(e, message);
    },
    [dragX, message, onPointerUp, onSwipeReply],
  );

  const replyOpacity = Math.min(1, dragX / SWIPE_THRESHOLD);

  return (
    <div
      data-mine={mine ? "1" : "0"}
      className="chat-msg-row w-full touch-manipulation"
      style={{
        direction: "ltr",
        display: "flex",
        justifyContent: mine ? "flex-end" : "flex-start",
      }}
    >
      <div
        className={"flex w-max max-w-[min(75vw,280px)] items-end gap-2 " + (mine ? "" : "flex-row")}
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerCancel={handleUp}
        onContextMenu={e => e.preventDefault()}
      >
        {!mine && avatarName != null && avatarName !== "" && (
          <Avatar name={avatarName} src={avatarSrc} size={28} className="mb-0.5 shrink-0 self-end" />
        )}
        <div className="relative w-max max-w-full">
          {dragX > 6 && (
            <span
              className={
                "pointer-events-none absolute top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full " +
                (mine ? "right-full mr-2" : "left-0 -translate-x-[calc(100%+6px)]") +
                " " +
                (isQuran ? "bg-zinc-800 text-zinc-300" : "bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-200")
              }
              style={{ opacity: replyOpacity }}
              aria-hidden
            >
              <Reply size={16} strokeWidth={2.25} />
            </span>
          )}
          <div
            className="relative w-max max-w-full will-change-transform"
            style={{
              transform: dragX > 0 ? `translateX(${dragX}px)` : undefined,
              transition: dragX > 0 ? "none" : "transform 0.22s cubic-bezier(0.32, 0.72, 0, 1)",
            }}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
