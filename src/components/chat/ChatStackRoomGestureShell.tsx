import { useEffect, type ReactNode, type RefObject } from "react";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import { readSafeViewportWidth } from "@/lib/safeLayoutDimensions";

export type ChatStackRoomGestureShellProps = {
  roomRef: RefObject<HTMLDivElement | null>;
  widthCapRef: RefObject<number>;
  children: ReactNode;
  /** false أثناء انتقال فتح — لا تلتقط اللمس */
  interactive?: boolean;
};

/** غلاف غرفة المحادثة في المكدس — سحب الرجوع يُدار من useChatSwipeBack داخل ChatRoom */
export function ChatStackRoomGestureShell({
  roomRef,
  widthCapRef,
  children,
  interactive = true,
}: ChatStackRoomGestureShellProps) {
  const hasRoomContent = children != null && children !== false;

  useEffect(() => {
    try {
      if (widthCapRef.current <= 0) widthCapRef.current = readSafeViewportWidth();
    } catch {
      widthCapRef.current = readSafeViewportWidth();
    }
  }, [widthCapRef]);

  return (
    <AppErrorBoundary label="غرفة المحادثة">
      <div
        ref={roomRef}
        data-chat-stack-room
        aria-hidden={!hasRoomContent}
        className={
          "chat-no-select chat-room-stack absolute inset-0 z-[2] flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden [transform:translateZ(0)] chat-room-stack-dismiss " +
          (hasRoomContent ? "bg-background " : "pointer-events-none bg-transparent ") +
          (interactive ? "pointer-events-auto touch-pan-y" : "pointer-events-none")
        }
      >
        {children}
      </div>
    </AppErrorBoundary>
  );
}
