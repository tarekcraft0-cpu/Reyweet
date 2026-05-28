import { useCallback, useEffect, useRef, useState } from "react";
import type { AppState, ID } from "@/lib/types";
import { userById } from "@/lib/store";
import { formatStoryViewTime, storyViewerSeenAt } from "@/lib/storyTray";
import { Avatar } from "../Avatar";
import { VerifiedMarkForUser } from "../VerifiedBadge";
import { Trash2 } from "lucide-react";
import type { StoryItem } from "@/lib/types";

type Props = {
  open: boolean;
  story: StoryItem;
  state: AppState;
  onClose: () => void;
  onOpenProfile?: (id: ID) => void;
  onDelete?: () => void;
};

export function StoryViewsSheet({
  open,
  story,
  state,
  onClose,
  onOpenProfile,
  onDelete,
}: Props) {
  const [sheetY, setSheetY] = useState(0);
  const [sheetSpring, setSheetSpring] = useState(false);
  const dragRef = useRef<{
    pointerId: number;
    startY: number;
    startSheetY: number;
    lastY: number;
    lastT: number;
    velocity: number;
  } | null>(null);
  const sheetMaxRef = useRef(0);

  const viewerIds = [...new Set(story.viewedByUserIds || [])];
  const viewers = viewerIds
    .map(id => {
      const u = userById(state, id);
      if (!u) return null;
      const at = storyViewerSeenAt(story, id) ?? story.createdAt;
      return { user: u, at };
    })
    .filter(Boolean) as { user: NonNullable<ReturnType<typeof userById>>; at: number }[];

  viewers.sort((a, b) => b.at - a.at);

  useEffect(() => {
    if (!open) {
      setSheetY(0);
      setSheetSpring(false);
    }
  }, [open]);

  useEffect(() => {
    sheetMaxRef.current = Math.min(window.innerHeight * 0.78, 640);
  }, [open]);

  const snapClose = useCallback(() => {
    setSheetSpring(true);
    setSheetY(sheetMaxRef.current);
    window.setTimeout(() => onClose(), 280);
  }, [onClose]);

  const snapOpen = useCallback(() => {
    setSheetSpring(true);
    setSheetY(0);
    window.setTimeout(() => setSheetSpring(false), 320);
  }, []);

  const onSheetPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    dragRef.current = {
      pointerId: e.pointerId,
      startY: e.clientY,
      startSheetY: sheetY,
      lastY: e.clientY,
      lastT: performance.now(),
      velocity: 0,
    };
    setSheetSpring(false);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const onSheetPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const p = dragRef.current;
    if (!p || e.pointerId !== p.pointerId) return;
    const dy = Math.max(0, e.clientY - p.startY);
    const now = performance.now();
    const dt = Math.max(1, now - p.lastT);
    p.velocity = (e.clientY - p.lastY) / dt;
    p.lastY = e.clientY;
    p.lastT = now;
    setSheetY(p.startSheetY + dy);
  };

  const endSheetDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const p = dragRef.current;
    dragRef.current = null;
    try {
      if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      /* ignore */
    }
    if (!p || e.pointerId !== p.pointerId) return;
    const dy = sheetY;
    if (dy > sheetMaxRef.current * 0.28 || p.velocity > 0.45) snapClose();
    else snapOpen();
  };

  if (!open) return null;

  const sheetProgress = sheetY / Math.max(1, sheetMaxRef.current);

  return (
    <div className="fixed inset-0 z-[80] flex flex-col justify-end" role="dialog" aria-modal="true">
      <button
        type="button"
        className="absolute inset-0 bg-black/50 backdrop-blur-md transition-opacity duration-200"
        style={{ opacity: Math.max(0, 1 - sheetProgress * 0.5) }}
        aria-label="إغلاق"
        onClick={snapClose}
      />
      <div
        className="relative mx-auto w-full max-w-md flex flex-col rounded-t-[1.35rem] border border-white/10 border-b-0 bg-[#1c1c1e] shadow-[0_-12px_48px_rgba(0,0,0,0.55)] touch-none"
        style={{
          maxHeight: "min(78dvh, 640px)",
          transform: `translate3d(0, ${sheetY}px, 0)`,
          transition: sheetSpring
            ? "transform 0.32s cubic-bezier(0.32, 0.72, 0, 1)"
            : "none",
        }}
        onPointerDown={onSheetPointerDown}
        onPointerMove={onSheetPointerMove}
        onPointerUp={endSheetDrag}
        onPointerCancel={endSheetDrag}
      >
        <div className="flex justify-center pt-2.5 pb-1" aria-hidden>
          <div className="h-1 w-11 rounded-full bg-white/25" />
        </div>
        <h2 className="px-4 pb-2 text-center text-[15px] font-semibold text-white">
          المشاهدات · {viewers.length}
        </h2>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-2 [-webkit-overflow-scrolling:touch]">
          {viewers.length === 0 ? (
            <p className="py-12 text-center text-sm text-white/45">لا مشاهدات بعد</p>
          ) : (
            <ul className="space-y-0.5 pb-2">
              {viewers.map(({ user: vu, at }) => (
                <li key={vu.id}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-start active:bg-white/10"
                    onClick={() => {
                      onClose();
                      onOpenProfile?.(vu.id);
                    }}
                  >
                    <Avatar name={vu.username} src={vu.avatar} size={44} />
                    <div className="min-w-0 flex-1">
                      <span className="flex items-center gap-1 font-medium text-white">
                        @{vu.username}
                        <VerifiedMarkForUser user={vu} size={14} />
                      </span>
                    </div>
                    <span className="shrink-0 text-xs text-white/45">{formatStoryViewTime(at)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="shrink-0 space-y-2 border-t border-white/10 p-3 pb-[max(0.75rem,var(--sab))]">
          {onDelete && (
            <button
              type="button"
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-red-500/20 py-3 text-sm font-semibold text-red-300"
              onClick={onDelete}
            >
              <Trash2 size={18} aria-hidden />
              حذف الستوري
            </button>
          )}
          <button
            type="button"
            className="w-full rounded-2xl bg-white/12 py-3 text-sm font-semibold text-white"
            onClick={snapClose}
          >
            تم
          </button>
        </div>
      </div>
    </div>
  );
}
