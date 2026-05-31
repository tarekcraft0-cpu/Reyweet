import { useEffect, type ReactNode, type RefObject } from "react";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import type { ChatRightEdgeDismissGestureHandlers } from "@/hooks/useChatRightEdgeDismissGesture";
import { readSafeViewportWidth } from "@/lib/safeLayoutDimensions";

const noopGesture: ChatRightEdgeDismissGestureHandlers = {
  onPointerDownCapture: () => {},
  onPointerMoveCapture: () => {},
  onPointerUpCapture: () => {},
  onPointerCancelCapture: () => {},
};

export type ChatStackRoomGestureShellProps = {
  roomRef: RefObject<HTMLDivElement | null>;
  widthCapRef: RefObject<number>;
  edgeGesture?: ChatRightEdgeDismissGestureHandlers;
  children: ReactNode;
  /** false أثناء سحب فتح المحادثة من القائمة — لا تلتقط اللمس */
  interactive?: boolean;
};

/**
 * غلاف آمن لغرفة المحادثة في المكدس: سحب يمين→يسار من الحافة اليمنى + Error Boundary.
 */
export function ChatStackRoomGestureShell({
  roomRef,
  widthCapRef,
  edgeGesture = noopGesture,
  children,
  interactive = true,
}: ChatStackRoomGestureShellProps) {
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
        data-chat-dismiss-rtl="1"
        className={
          "chat-no-select chat-room-stack absolute inset-0 z-[2] flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden bg-background [transform:translateZ(0)] chat-room-stack-dismiss " +
          (interactive ? "pointer-events-auto touch-manipulation" : "pointer-events-none")
        }
      >
        {children}
      </div>
    </AppErrorBoundary>
  );
}
