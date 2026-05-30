import { memo, useCallback, useRef, useState } from "react";
import { Reply } from "lucide-react";
import { Avatar } from "../Avatar";
import type { Message } from "@/lib/types";

const SWIPE_THRESHOLD = 48;
const SWIPE_MAX = 76;

/**
 * محاذاة فيزيائية ثابتة (لا تتأثر بلغة الواجهة):
 * - رسائلي: يمين الشاشة
 * - الطرف الآخر: يسار الشاشة + أفاتار يسار الفقاعة
 */
function ChatSwipeMessageRowInner({
  message,
  mine,
  avatarName,
  avatarSrc,
  reservePeerAvatarSlot,
  isQuran,
  children,
  onSwipeReply,
  onAvatarClick,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  mine: boolean;
  avatarName?: string;
  avatarSrc?: string;
  reservePeerAvatarSlot?: boolean;
  isQuran: boolean;
  children: React.ReactNode;
  onSwipeReply: () => void;
  onAvatarClick?: () => void;
  onPointerDown: (e: React.PointerEvent, m: Message) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent, m: Message) => void;
  message: Message;
}) {
  const [dragX, setDragX] = useState(0);
  const dragXRef = useRef(0);
  const swipeRef = useRef<{ x: number; y: number; active: boolean } | null>(null);

  const handleDown = useCallback(
    (e: React.PointerEvent) => {
      swipeRef.current = { x: e.clientX, y: e.clientY, active: true };
      dragXRef.current = 0;
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
          if (dragXRef.current === 0) {
            try {
              (e.currentTarget as Element).setPointerCapture(e.pointerId);
            } catch {
              /* ignore */
            }
          }
          e.stopPropagation();
          const next = Math.min(SWIPE_MAX, dx * 0.92);
          dragXRef.current = next;
          setDragX(next);
          return;
        }
        if (Math.abs(dy) > 18) {
          swipeRef.current = { ...s, active: false };
          dragXRef.current = 0;
          setDragX(0);
        }
      }
      onPointerMove(e);
    },
    [onPointerMove],
  );

  const handleUp = useCallback(
    (e: React.PointerEvent) => {
      const dx = dragXRef.current;
      if (dx >= SWIPE_THRESHOLD) onSwipeReply();
      dragXRef.current = 0;
      setDragX(0);
      swipeRef.current = null;
      try {
        (e.currentTarget as Element).releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      onPointerUp(e, message);
    },
    [message, onPointerUp, onSwipeReply],
  );

  const replyOpacity = dragX > 0 ? Math.min(1, dragX / SWIPE_THRESHOLD) : 0;

  return (
    <div
      data-mine={mine ? "1" : "0"}
      className="chat-msg-row chat-msg-enter w-full touch-manipulation select-none"
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
        onSelectStart={e => e.preventDefault()}
        onDragStart={e => e.preventDefault()}
      >
        {!mine && reservePeerAvatarSlot && (
          <span className="mb-0.5 h-7 w-7 shrink-0 self-end" aria-hidden />
        )}
        {!mine && !reservePeerAvatarSlot && avatarName != null && avatarName !== "" && (
          onAvatarClick ? (
            <button
              type="button"
              className="mb-0.5 shrink-0 self-end touch-manipulation rounded-full transition active:scale-95 hover:opacity-90"
              aria-label={`@${avatarName}`}
              onPointerDown={e => e.stopPropagation()}
              onClick={e => {
                e.stopPropagation();
                onAvatarClick();
              }}
            >
              <Avatar name={avatarName} src={avatarSrc} size={28} />
            </button>
          ) : (
            <Avatar name={avatarName} src={avatarSrc} size={28} className="mb-0.5 shrink-0 self-end" />
          )
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

/**
 * React.memo — يمنع إعادة رسم الرسالة ما لم تتغيّر خصائصها.
 * المقارنة: id الرسالة + status + reactions + mine (كافية للدردشة).
 */
/**
 * React.memo مع مقارنة مخصّصة:
 * - message: مقارنة id + status + reactions (بدل reference equality لأن الـ store يُنشئ objects جديدة)
 * - باقي الـ props: === عادية
 * - الـ callbacks (onSwipeReply/onAvatarClick): يُعاد إنشاؤها في map لذا نتجاهلها في المقارنة
 *   وبدلاً من ذلك نعتمد على أن message.id يتغيّر عند تغيير الرسالة الفعلي.
 */
function messageChanged(a: Message, b: Message): boolean {
  return (
    a.id !== b.id ||
    a.status !== b.status ||
    a.content !== b.content ||
    a.type !== b.type ||
    JSON.stringify(a.reactions) !== JSON.stringify(b.reactions)
  );
}

export const ChatSwipeMessageRow = memo(ChatSwipeMessageRowInner, (prev, next) => {
  if (messageChanged(prev.message, next.message)) return false;
  if (prev.mine !== next.mine) return false;
  if (prev.avatarName !== next.avatarName) return false;
  if (prev.avatarSrc !== next.avatarSrc) return false;
  if (prev.reservePeerAvatarSlot !== next.reservePeerAvatarSlot) return false;
  if (prev.isQuran !== next.isQuran) return false;
  if (prev.onPointerDown !== next.onPointerDown) return false;
  if (prev.onPointerMove !== next.onPointerMove) return false;
  if (prev.onPointerUp !== next.onPointerUp) return false;
  // children: نتجاهل المقارنة لأنها تتبع message (المقارَن أعلاه)
  return true;
});
