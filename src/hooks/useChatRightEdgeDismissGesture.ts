import { useCallback, useEffect, useRef, type RefObject } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { isChatDismissSwipeDelta } from "@/lib/edgeSwipeDismiss";
import {
  CHAT_RIGHT_EDGE_HIT_PX,
  isPointerOnChatRightDismissEdge,
  readSafeStackCapPx,
  safeChatDismissTranslation,
} from "@/lib/safeLayoutDimensions";

export type ChatRightEdgeDismissGestureHandlers = {
  onPointerDownCapture: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMoveCapture: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUpCapture: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerCancelCapture: (e: ReactPointerEvent<HTMLDivElement>) => void;
};

type EdgeDragState = {
  pointerId: number;
  startX: number;
  startY: number;
  armed: boolean;
} | null;

export type UseChatRightEdgeDismissGestureOptions = {
  roomRef: RefObject<HTMLDivElement | null>;
  widthCapRef: RefObject<number>;
  isEnabled: () => boolean;
  onDragStart?: () => void;
  onDrag: (tx: number, animate: boolean) => void;
  onRelease: (opts: { closing: boolean; capPx: number }) => void;
  commitFraction?: number;
  minCommitPx?: number;
};

function runGestureSafe(fn: () => void): void {
  try {
    fn();
  } catch (err) {
    console.warn("[chat-right-edge-gesture]", err);
  }
}

export function useChatRightEdgeDismissGesture({
  roomRef,
  widthCapRef,
  isEnabled,
  onDragStart,
  onDrag,
  onRelease,
  commitFraction = 0.5,
  minCommitPx = 64,
}: UseChatRightEdgeDismissGestureOptions): ChatRightEdgeDismissGestureHandlers & {
  pointer: {
    onEdgePointerDown: (e: PointerEvent) => void;
    onPointerMove: (e: PointerEvent) => void;
    onPointerUp: (e: PointerEvent) => void;
  };
} {
  const dragRef = useRef<EdgeDragState>(null);

  useEffect(() => {
    return () => {
      dragRef.current = null;
    };
  }, []);

  const releaseCapture = useCallback(
    (pointerId: number) => {
      try {
        roomRef.current?.releasePointerCapture(pointerId);
      } catch {
        /* ignore */
      }
    },
    [roomRef],
  );

  const tryBeginEdgeDrag = useCallback(
    (pointerId: number, clientX: number, clientY: number) => {
      if (!isEnabled()) return false;
      const el = roomRef.current;
      if (!el) return false;
      const rect = el.getBoundingClientRect?.() ?? null;
      if (!isPointerOnChatRightDismissEdge(clientX, rect, CHAT_RIGHT_EDGE_HIT_PX)) return false;

      dragRef.current = {
        pointerId,
        startX: clientX,
        startY: clientY,
        armed: false,
      };
      onDragStart?.();
      try {
        el.setPointerCapture(pointerId);
      } catch {
        /* ignore */
      }
      return true;
    },
    [isEnabled, roomRef, onDragStart],
  );

  const tryMoveEdgeDrag = useCallback(
    (pointerId: number, clientX: number, clientY: number) => {
      const d = dragRef.current;
      if (!d || d.pointerId !== pointerId) return;

      const dx = clientX - d.startX;
      const dy = clientY - d.startY;

      if (!d.armed) {
        if (dx > 0) return;
        if (!isChatDismissSwipeDelta(dx, dy)) return;
        d.armed = true;
      }

      const cap = readSafeStackCapPx(roomRef.current, widthCapRef);
      widthCapRef.current = cap;
      onDrag(safeChatDismissTranslation(dx, cap), false);
    },
    [roomRef, widthCapRef, onDrag],
  );

  const tryFinishEdgeDrag = useCallback(
    (pointerId: number, clientX: number) => {
      const d = dragRef.current;
      if (!d || d.pointerId !== pointerId) return;
      dragRef.current = null;
      releaseCapture(pointerId);

      if (!d.armed) return;

      const cap = readSafeStackCapPx(roomRef.current, widthCapRef);
      widthCapRef.current = cap;
      const tx = safeChatDismissTranslation(clientX - d.startX, cap);
      const threshold = Math.max(cap * commitFraction, minCommitPx);
      onRelease({ closing: tx <= -threshold, capPx: cap });
    },
    [roomRef, widthCapRef, onRelease, releaseCapture, commitFraction, minCommitPx],
  );

  const onPointerDownCapture = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      runGestureSafe(() => {
        if (e.button !== 0) return;
        tryBeginEdgeDrag(e.pointerId, e.clientX, e.clientY);
      });
    },
    [tryBeginEdgeDrag],
  );

  const onPointerMoveCapture = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      runGestureSafe(() => {
        tryMoveEdgeDrag(e.pointerId, e.clientX, e.clientY);
        const d = dragRef.current;
        if (d?.armed && d.pointerId === e.pointerId && e.cancelable) e.preventDefault();
      });
    },
    [tryMoveEdgeDrag],
  );

  const finishReactPointer = useCallback(
    (pointerId: number, clientX: number) => {
      runGestureSafe(() => tryFinishEdgeDrag(pointerId, clientX));
    },
    [tryFinishEdgeDrag],
  );

  const onPointerUpCapture = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      finishReactPointer(e.pointerId, e.clientX);
    },
    [finishReactPointer],
  );

  const onPointerCancelCapture = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      finishReactPointer(e.pointerId, e.clientX);
    },
    [finishReactPointer],
  );

  const pointer = {
    onEdgePointerDown: useCallback(
      (e: PointerEvent) => {
        runGestureSafe(() => tryBeginEdgeDrag(e.pointerId, e.clientX, e.clientY));
      },
      [tryBeginEdgeDrag],
    ),
    onPointerMove: useCallback(
      (e: PointerEvent) => {
        runGestureSafe(() => tryMoveEdgeDrag(e.pointerId, e.clientX, e.clientY));
      },
      [tryMoveEdgeDrag],
    ),
    onPointerUp: useCallback(
      (e: PointerEvent) => {
        runGestureSafe(() => tryFinishEdgeDrag(e.pointerId, e.clientX));
      },
      [tryFinishEdgeDrag],
    ),
  };

  return {
    onPointerDownCapture,
    onPointerMoveCapture,
    onPointerUpCapture,
    onPointerCancelCapture,
    pointer,
  };
}
