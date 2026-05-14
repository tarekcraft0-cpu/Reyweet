import { useCallback, useEffect, useRef, useState } from "react";
import { useApp, userById, visibleMediaNotes, isMutual, visibleStoryUserIds, nextStoryAuthorAfter } from "@/lib/store";
import { notifyGuestActionBlocked } from "@/lib/guestBlocked";
import type { MediaNote } from "@/lib/types";
import { Avatar } from "./Avatar";
import { ShareSheet } from "./ShareSheet";
import { NoteReplySheet } from "./NoteReplySheet";
import { StoryStickerLayer } from "./story/StoryStickerLayer";
import { VerifiedMarkForUser } from "./VerifiedBadge";
import { isRenderableMediaUrl } from "@/lib/mediaUrl";
import { X, Send, Share2, Bookmark, ChevronLeft, Heart, ChevronUp } from "lucide-react";

const STORY_SEGMENT_CAP_MS = 5000;

export function StoryViewer({
  userId,
  onClose,
  onOpenProfile,
  onOpenChat,
  onRequestAuthor,
}: {
  userId: string;
  onClose: () => void;
  onOpenProfile?: (id: string) => void;
  onOpenChat?: (chatId: string) => void;
  /** الانتقال لحساب ستوري آخر، أو `null` للإغلاق */
  onRequestAuthor?: (id: string | null) => void;
}) {
  const { state, currentUser, openOrCreateChat, sendMessage, toggleStoryLike, recordStoryView, isGuest } = useApp();
  const me = currentUser!;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const author = userById(state, userId);
  const stories = state.stories
    .filter(s => s.userId === userId)
    .filter(s => s.audience === "all" || s.userId === me.id || (author?.closeFriends.includes(me.id) ?? false))
    .sort((a, b) => a.createdAt - b.createdAt);

  const ring = visibleStoryUserIds(state, me.id);

  const [i, setI] = useState(0);
  const cappedStoryIndex = stories.length > 0 ? Math.min(Math.max(0, i), stories.length - 1) : 0;
  const curStoryForHooks = stories.length > 0 ? stories[cappedStoryIndex] : undefined;

  const [reply, setReply] = useState("");
  const [shareStoryId, setShareStoryId] = useState<string | null>(null);
  const [noteToReply, setNoteToReply] = useState<MediaNote | null>(null);
  const [showHighlightModal, setShowHighlightModal] = useState(false);
  const [highlightTitle, setHighlightTitle] = useState("");

  const snapRef = useRef({ storiesLen: stories.length, userId, ring });
  snapRef.current = { storiesLen: stories.length, userId, ring };

  const canReplyToStories = userId === me.id || (author?.allowStoryReplies !== false);

  const [segmentMs, setSegmentMs] = useState(STORY_SEGMENT_CAP_MS);
  const deadlineRef = useRef(0);
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdRemainingRef = useRef(0);
  const isHoldingProgressRef = useRef(false);
  const [middleHold, setMiddleHold] = useState(false);
  const [ownViewsOpen, setOwnViewsOpen] = useState(false);
  const ownPullRef = useRef<{ y0: number; pointerId: number } | null>(null);

  const clearAdvanceTimer = useCallback(() => {
    if (advanceTimerRef.current != null) {
      window.clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
  }, []);

  const goForward = useCallback(() => {
    clearAdvanceTimer();
    setI(prev => {
      const { storiesLen, userId: uid, ring: r } = snapRef.current;
      if (prev < storiesLen - 1) return prev + 1;
      const nextU = nextStoryAuthorAfter(r, uid);
      if (nextU) {
        onRequestAuthor?.(nextU);
        return prev;
      }
      if (onRequestAuthor) onRequestAuthor(null);
      else onCloseRef.current();
      return prev;
    });
  }, [onRequestAuthor, clearAdvanceTimer]);

  const goBack = useCallback(() => {
    setI(prev => (prev > 0 ? prev - 1 : prev));
  }, []);

  const goForwardRef = useRef(goForward);
  goForwardRef.current = goForward;

  useEffect(() => {
    setI(0);
  }, [userId]);

  useEffect(() => {
    if (stories.length === 0) return;
    setI(prev => Math.min(prev, stories.length - 1));
  }, [stories.length]);

  useEffect(() => {
    if (!author) {
      const t = window.setTimeout(() => onCloseRef.current(), 0);
      return () => clearTimeout(t);
    }
  }, [author]);

  useEffect(() => {
    if (!curStoryForHooks?.id) return;
    setSegmentMs(STORY_SEGMENT_CAP_MS);
    isHoldingProgressRef.current = false;
    setMiddleHold(false);
  }, [curStoryForHooks?.id]);

  const armAdvanceTimer = useCallback(() => {
    clearAdvanceTimer();
    if (!author || stories.length === 0 || isHoldingProgressRef.current) return;
    const ms = Math.max(0, deadlineRef.current - Date.now());
    if (ms <= 0) {
      goForwardRef.current();
      return;
    }
    advanceTimerRef.current = window.setTimeout(() => {
      advanceTimerRef.current = null;
      goForwardRef.current();
    }, ms);
  }, [author, stories.length, clearAdvanceTimer]);

  const pauseProgressForHold = useCallback(() => {
    if (isHoldingProgressRef.current) return;
    isHoldingProgressRef.current = true;
    holdRemainingRef.current = Math.max(0, deadlineRef.current - Date.now());
    clearAdvanceTimer();
  }, [clearAdvanceTimer]);

  const resumeProgressAfterHold = useCallback(() => {
    if (!isHoldingProgressRef.current) return;
    isHoldingProgressRef.current = false;
    deadlineRef.current = Date.now() + holdRemainingRef.current;
    armAdvanceTimer();
  }, [armAdvanceTimer]);

  useEffect(() => {
    if (!curStoryForHooks?.id || userId === me.id || isGuest) return;
    recordStoryView(curStoryForHooks.id);
  }, [curStoryForHooks?.id, userId, me.id, isGuest, recordStoryView]);

  useEffect(() => {
    setOwnViewsOpen(false);
  }, [curStoryForHooks?.id, userId]);

  useEffect(() => {
    if (!author || stories.length === 0) return;
    if (ownViewsOpen) {
      clearAdvanceTimer();
      return;
    }
    deadlineRef.current = Date.now() + segmentMs;
    armAdvanceTimer();
    return () => clearAdvanceTimer();
  }, [i, stories.length, author, userId, segmentMs, ownViewsOpen, armAdvanceTimer, clearAdvanceTimer]);

  if (!author) {
    return null;
  }

  if (stories.length === 0) {
    return (
      <div className="fixed inset-0 bg-black z-[60] flex flex-col items-center justify-center p-6 text-white">
        <button type="button" className="absolute top-3 end-3 p-2 rounded-full bg-white/10" onClick={() => onCloseRef.current()} aria-label="إغلاق">
          <X size={24} />
        </button>
        <p className="text-center text-base mb-2 mt-8">لا توجد ستوريات لهذا الحساب حالياً.</p>
        {userId === me.id && <p className="text-center text-sm text-white/70 mb-6">أنشئ ستوري من زر + ثم اختر «ستوري».</p>}
        <button type="button" className="bg-[#0095F6] px-8 py-2.5 rounded-full font-semibold" onClick={() => onCloseRef.current()}>
          رجوع
        </button>
      </div>
    );
  }

  const displayIdx = Math.min(Math.max(0, i), stories.length - 1);
  const cur = stories[displayIdx];
  const storyLiked = (cur.likes || []).includes(me.id);
  const storyNotes = visibleMediaNotes(state, "story", cur.id, me.id).slice(0, 8);

  const storyViewerIds = [...new Set((state.stories.find(s => s.id === cur.id)?.viewedByUserIds) || [])];
  const storyViewersSorted = storyViewerIds
    .filter(id => userById(state, id))
    .sort((a, b) => userById(state, a)!.username.localeCompare(userById(state, b)!.username, "ar"));

  const submitReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (isGuest) {
      notifyGuestActionBlocked();
      return;
    }
    if (!reply.trim() || !canReplyToStories || userId === me.id) return;
    const chat = openOrCreateChat(userId);
    if (!chat) {
      if (isGuest) notifyGuestActionBlocked();
      else window.alert("تعذّر فتح المحادثة.");
      return;
    }
    sendMessage(chat.id, {
      type: "text",
      content: `↩️ رد على ستوري: ${reply.trim()}`,
    });
    setReply("");
  };

  const saveAsHighlight = () => {
    if (!highlightTitle.trim() || userId !== me.id) return;
    alert(`تم حفظ الهايلايت "${highlightTitle}" بنجاح!`);
    setShowHighlightModal(false);
    setHighlightTitle("");
  };

  const onOwnZonePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || ownViewsOpen) return;
    ownPullRef.current = { y0: e.clientY, pointerId: e.pointerId };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const onOwnZonePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const p = ownPullRef.current;
    if (!p || e.pointerId !== p.pointerId || ownViewsOpen) return;
    const pull = p.y0 - e.clientY;
    if (pull > 96) setOwnViewsOpen(true);
  };

  const endOwnZonePull = (e: React.PointerEvent<HTMLDivElement>) => {
    const p = ownPullRef.current;
    ownPullRef.current = null;
    try {
      if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      /* ignore */
    }
    if (ownViewsOpen || !p || e.pointerId !== p.pointerId) return;
    const pull = p.y0 - e.clientY;
    if (pull > 44) setOwnViewsOpen(true);
  };

  return (
    <div className="fixed inset-0 bg-black z-[60] flex flex-col">
      <div className="flex gap-1 p-2 shrink-0">
        {stories.map((_, idx) => (
          <div key={idx} className="flex-1 h-0.5 bg-white/30 rounded">
            <div
              className={
                "h-full bg-white rounded transition-all " +
                (idx < displayIdx ? "w-full" : idx === displayIdx ? "w-full animate-story-seg" : "w-0")
              }
              style={
                idx === displayIdx
                  ? {
                      animationDuration: `${segmentMs / 1000}s`,
                      animationPlayState: middleHold || ownViewsOpen ? "paused" : "running",
                    }
                  : undefined
              }
            />
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 px-3 text-white shrink-0">
        <button type="button" onClick={() => onCloseRef.current()} className="p-2" aria-label="رجوع">
          <ChevronLeft size={24} />
        </button>

        <button type="button" onClick={() => onOpenProfile?.(author.id)} className="flex items-center gap-2 flex-1 min-w-0">
          <Avatar name={author.username} src={author.avatar} size={32} />
          <span className="text-sm font-semibold inline-flex items-center gap-1">
            @{author.username}
            <VerifiedMarkForUser user={author} size={16} />
          </span>
        </button>

        {cur.audience === "close" && <span className="text-xs bg-green-600 px-2 py-0.5 rounded-full">مقربون</span>}

        <div className="flex items-center gap-1">
          {userId !== me.id && (
            <button
              type="button"
              className={"p-2 rounded-full " + (storyLiked ? "text-red-500" : "text-white hover:bg-white/10")}
              onClick={e => {
                e.stopPropagation();
                if (isGuest) {
                  notifyGuestActionBlocked();
                  return;
                }
                toggleStoryLike(cur.id);
              }}
              aria-label="إعجاب"
            >
              <Heart size={22} className={storyLiked ? "fill-current" : ""} />
            </button>
          )}
          {userId === me.id && (
            <button type="button" className="p-2" onClick={() => setShowHighlightModal(true)} aria-label="حفظ كهايلايت">
              <Bookmark size={20} />
            </button>
          )}
          <button type="button" className="p-2" onClick={() => setShareStoryId(cur.id)} aria-label="مشاركة">
            <Share2 size={20} />
          </button>
        </div>
      </div>

      {storyNotes.length > 0 && (
        <div className="flex justify-center gap-3 flex-wrap px-2 py-2 shrink-0">
          {storyNotes.map(n => {
            const nu = userById(state, n.authorId);
            if (!nu) return null;
            if (n.authorId !== me.id && !isMutual(state, me.id, n.authorId)) return null;
            const canReplyNote = onOpenChat && n.authorId !== me.id;
            return (
              <div key={n.id} className="flex flex-col items-center max-w-[4.5rem]">
                {canReplyNote ? (
                  <button
                    type="button"
                    title="رد في الخاص"
                    onClick={() => {
                      if (isGuest) {
                        notifyGuestActionBlocked();
                        return;
                      }
                      setNoteToReply(n);
                    }}
                    className="text-[10px] leading-tight text-start bg-white/10 rounded-xl px-1.5 py-0.5 mb-1 line-clamp-2 text-white hover:bg-white/20 w-full"
                  >
                    {n.text}
                  </button>
                ) : (
                  <div className="text-[10px] leading-tight text-start bg-white/10 rounded-xl px-1.5 py-0.5 mb-1 line-clamp-2 text-white w-full">
                    {n.text}
                  </div>
                )}
                <button type="button" onClick={() => onOpenProfile?.(nu.id)}>
                  <Avatar name={nu.username} src={nu.avatar} size={32} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden text-white">
        <div className="relative z-10 flex max-h-full max-w-full items-center justify-center">
          {cur.video && isRenderableMediaUrl(cur.video) ? (
            <video
              key={cur.id}
              src={cur.video}
              className="max-h-full max-w-full object-contain select-none touch-manipulation"
              playsInline
              muted
              autoPlay
              loop={false}
              controls={false}
              onLoadedMetadata={e => {
                const d = e.currentTarget.duration;
                if (Number.isFinite(d) && d > 0) {
                  setSegmentMs(Math.min(STORY_SEGMENT_CAP_MS, Math.max(1000, Math.ceil(d * 1000))));
                }
              }}
              onEnded={() => goForwardRef.current()}
            />
          ) : isRenderableMediaUrl(cur.image) ? (
            <img
              src={cur.image}
              className="max-h-full max-w-full object-contain select-none touch-manipulation"
              alt=""
              draggable={false}
            />
          ) : (
            <span className="text-7xl select-none touch-manipulation">{cur.image}</span>
          )}
          <StoryStickerLayer story={cur} storyAuthorId={author.id} onOpenProfile={onOpenProfile} />
        </div>
        <div
          className="absolute inset-y-0 start-[26%] end-[28%] z-[35] touch-none"
          onPointerDown={e => {
            if (e.button !== 0) return;
            try {
              e.currentTarget.setPointerCapture(e.pointerId);
            } catch {
              /* ignore */
            }
            pauseProgressForHold();
            setMiddleHold(true);
          }}
          onPointerUp={e => {
            try {
              e.currentTarget.releasePointerCapture(e.pointerId);
            } catch {
              /* ignore */
            }
            resumeProgressAfterHold();
            setMiddleHold(false);
          }}
          onPointerCancel={e => {
            try {
              e.currentTarget.releasePointerCapture(e.pointerId);
            } catch {
              /* ignore */
            }
            resumeProgressAfterHold();
            setMiddleHold(false);
          }}
        />
        <button
          type="button"
          className="absolute inset-y-0 start-0 w-[26%] z-40 bg-transparent touch-manipulation select-none"
          aria-label="الستوري السابق"
          onClick={e => {
            e.stopPropagation();
            goBack();
          }}
        />
        <button
          type="button"
          className="absolute inset-y-0 end-0 w-[28%] z-40 bg-transparent touch-manipulation select-none"
          aria-label="الستوري التالي"
          onClick={e => {
            e.stopPropagation();
            goForward();
          }}
        />
      </div>

      {canReplyToStories && userId !== me.id && !isGuest && (
        <form onSubmit={submitReply} className="shrink-0 p-3 flex gap-2 bg-black/80 border-t border-white/10">
          <input
            value={reply}
            onChange={e => setReply(e.target.value)}
            placeholder="رد على الستوري..."
            className="flex-1 bg-white/10 rounded-full px-4 py-2 text-sm text-white placeholder:text-white/50 outline-none"
            onClick={e => e.stopPropagation()}
          />
          <button type="submit" className="p-2 rounded-full bg-primary text-primary-foreground" aria-label="إرسال">
            <Send size={20} />
          </button>
        </form>
      )}
      {userId === me.id && (
        <div
          className="shrink-0 z-[45] flex flex-col items-center justify-center gap-0.5 border-t border-white/5 bg-gradient-to-t from-black via-black/95 to-black/40 px-4 pt-2 pb-[max(0.65rem,env(safe-area-inset-bottom,0px))] touch-none select-none"
          style={{ touchAction: "none" }}
          onPointerDown={onOwnZonePointerDown}
          onPointerMove={onOwnZonePointerMove}
          onPointerUp={endOwnZonePull}
          onPointerCancel={endOwnZonePull}
        >
          <ChevronUp className="text-white/55" size={22} strokeWidth={2.25} aria-hidden />
          <span className="text-[11px] font-medium text-white/40 tracking-wide">اسحب لأعلى</span>
          <button
            type="button"
            className="mt-1 rounded-full bg-white/10 px-4 py-1.5 text-xs font-semibold text-white/90 backdrop-blur-sm transition-[transform,opacity] duration-200 ease-[cubic-bezier(0.25,0.1,0.25,1)] active:scale-[0.94] active:opacity-80"
            onPointerDown={e => e.stopPropagation()}
            onClick={() => setOwnViewsOpen(true)}
          >
            المشاهدات ({storyViewersSorted.length})
          </button>
        </div>
      )}

      {shareStoryId && <ShareSheet target={{ kind: "story", storyId: shareStoryId }} onClose={() => setShareStoryId(null)} />}
      {noteToReply && onOpenChat && (
        <NoteReplySheet note={noteToReply} contentLabelAr="ستوري" onClose={() => setNoteToReply(null)} onSent={onOpenChat} />
      )}

      {showHighlightModal && (
        <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4">
          <div className="bg-background rounded-3xl p-6 w-full max-w-sm">
            <h3 className="text-lg font-bold mb-4">حفظ كهايلايت</h3>
            <p className="text-sm text-muted-foreground mb-4">سيتم حفظ هذه القصة كهايلايت دائم في ملفك الشخصي</p>
            <input
              type="text"
              placeholder="عنوان الهايلايت"
              value={highlightTitle}
              onChange={e => setHighlightTitle(e.target.value)}
              className="w-full bg-input rounded-2xl px-4 py-3 outline-none mb-4"
            />
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowHighlightModal(false)} className="flex-1 py-3 rounded-2xl bg-secondary font-semibold">
                إلغاء
              </button>
              <button type="button" onClick={saveAsHighlight} className="flex-1 py-3 rounded-2xl bg-primary text-primary-foreground font-semibold">
                حفظ
              </button>
            </div>
          </div>
        </div>
      )}

      {userId === me.id && ownViewsOpen && (
        <div className="fixed inset-0 z-[80] flex flex-col justify-end" role="dialog" aria-modal="true" aria-labelledby="story-views-title">
          <button
            type="button"
            className="absolute inset-0 bg-black/55 backdrop-blur-[2px] transition-opacity duration-200"
            aria-label="إغلاق قائمة المشاهدات"
            onClick={() => setOwnViewsOpen(false)}
          />
          <div
            className="relative mx-auto w-full max-w-md rounded-t-[1.35rem] border border-white/10 border-b-0 bg-[#1c1c1e] shadow-[0_-8px_40px_rgba(0,0,0,0.45)] max-h-[min(78dvh,640px)] flex flex-col transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
            onPointerDown={e => e.stopPropagation()}
          >
            <div className="flex justify-center pt-2.5 pb-1" aria-hidden>
              <div className="h-1 w-11 rounded-full bg-white/22" />
            </div>
            <h2 id="story-views-title" className="px-4 pb-2 text-center text-[15px] font-semibold text-white">
              المشاهدات · {storyViewersSorted.length}
            </h2>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-2 pb-2 [-webkit-overflow-scrolling:touch]">
              {storyViewersSorted.length === 0 ? (
                <p className="py-12 text-center text-sm text-white/45">لا مشاهدات بعد</p>
              ) : (
                <ul className="space-y-0.5 pb-[env(safe-area-inset-bottom,0px)]">
                  {storyViewersSorted.map(vid => {
                    const vu = userById(state, vid)!;
                    return (
                      <li key={vid}>
                        <button
                          type="button"
                          className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-start transition-[transform,background-color] duration-150 ease-[cubic-bezier(0.25,0.1,0.25,1)] hover:bg-white/10 active:scale-[0.99]"
                          onClick={() => {
                            setOwnViewsOpen(false);
                            onOpenProfile?.(vu.id);
                          }}
                        >
                          <Avatar name={vu.username} src={vu.avatar} size={40} />
                          <span className="min-w-0 flex-1 truncate font-medium text-white">@{vu.username}</span>
                          <VerifiedMarkForUser user={vu} size={16} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <div className="shrink-0 border-t border-white/10 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]">
              <button
                type="button"
                className="w-full rounded-2xl bg-white/12 py-3 text-sm font-semibold text-white transition-[transform,opacity] duration-200 ease-[cubic-bezier(0.25,0.1,0.25,1)] active:scale-[0.98] active:opacity-90"
                onClick={() => setOwnViewsOpen(false)}
              >
                تم
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
