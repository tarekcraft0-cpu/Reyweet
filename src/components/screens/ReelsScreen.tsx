import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useIsTabActive } from "@/lib/tabActiveContext";
import { useApp, userById, visibleMediaNotes, isMutual } from "@/lib/store";
import { notifyGuestActionBlocked } from "@/lib/guestBlocked";
import type { MediaNote, Post, ProfileReturnContext } from "@/lib/types";
import { NoteReplySheet } from "../NoteReplySheet";
import { useT } from "@/lib/i18n";
import { Avatar } from "../Avatar";
import { ShareSheet } from "../ShareSheet";
import { Heart, MessageCircle, Send, Repeat2, Volume2, VolumeX, X, MoreVertical } from "lucide-react";
import { PostOptionsMenu, CommentOptionsMenu } from "../PostOptionsMenu";
import { VerifiedMarkForUser } from "../VerifiedBadge";
import { isReelFeedPost, normalizePostMedia, type NormalizedPostMedia } from "@/lib/postMedia";

function ReelMediaPlayer({
  media,
  active,
  soundOn,
}: {
  media: NormalizedPostMedia;
  active: boolean;
  soundOn: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !media.hasVideo) return;
    if (active) {
      v.muted = !soundOn;
      const play = v.play();
      if (play) {
        play.catch(() => {
          v.muted = true;
          void v.play();
        });
      }
    } else {
      v.pause();
      v.currentTime = 0;
    }
  }, [active, soundOn, media.hasVideo, media.videoUrl]);

  const frameClass =
    "absolute inset-0 flex items-center justify-center bg-black";

  if (media.hasVideo && media.videoUrl) {
    return (
      <div className={frameClass}>
        <video
          ref={videoRef}
          src={media.videoUrl}
          loop
          playsInline
          poster={media.posterUrl || undefined}
          className="max-h-full max-w-full object-contain"
        />
      </div>
    );
  }
  if (media.hasImage && media.imageUrl) {
    return (
      <div className={frameClass}>
        <img src={media.imageUrl} alt="" className="max-h-full max-w-full object-contain" />
      </div>
    );
  }
  return (
    <div className={frameClass + " text-5xl text-white/90"}>
      {media.emojiFallback || "🎬"}
    </div>
  );
}

/** احتياطي قبل قياس DOM — الشاشة − شريط ريلز/فريند − شريط التنقل السفلي */
const REEL_SLIDE_HEIGHT_FALLBACK =
  "calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 3.25rem)";

function ReelSlide({
  reelId,
  slideHeightPx,
  children,
}: {
  reelId: string;
  slideHeightPx: number;
  children: ReactNode;
}) {
  const slideStyle =
    slideHeightPx > 0
      ? { height: slideHeightPx, minHeight: slideHeightPx }
      : { height: REEL_SLIDE_HEIGHT_FALLBACK, minHeight: REEL_SLIDE_HEIGHT_FALLBACK };

  return (
    <section
      data-reel-slide
      data-reel-id={reelId}
      className="relative w-full shrink-0 overflow-hidden bg-black"
      style={slideStyle}
    >
      {children}
    </section>
  );
}

export function ReelsScreen({
  onOpenProfile,
  onOpenChat,
  restoreFromProfileContext = null,
  onConsumedRestoreFromProfile,
}: {
  onOpenProfile: (id: string, ctx?: ProfileReturnContext) => void;
  onOpenChat: (chatId: string) => void;
  restoreFromProfileContext?: ProfileReturnContext | null;
  onConsumedRestoreFromProfile?: () => void;
}) {
  const { state, toggleLike, toggleRepost, currentUser, addComment, isGuest, refreshFromServer } = useApp();
  const isTabActive = useIsTabActive("reels");
  const t = useT();
  const me = currentUser!;
  const guestBlock = () => {
    if (!isGuest) return false;
    notifyGuestActionBlocked();
    return true;
  };
  const [tab, setTab] = useState<"all" | "friends">("all");
  const [sharePost, setSharePost] = useState<Post | null>(null);
  const [commentsFor, setCommentsFor] = useState<Post | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [noteToReply, setNoteToReply] = useState<MediaNote | null>(null);
  const [reelPullHint, setReelPullHint] = useState(false);
  const [activeReelId, setActiveReelId] = useState<string | null>(null);
  const [soundOn, setSoundOn] = useState(true);
  const [soundUnlocked, setSoundUnlocked] = useState(false);
  const [reelMenuId, setReelMenuId] = useState<string | null>(null);
  const [commentMenuId, setCommentMenuId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pullRef = useRef({ y0: 0, active: false });
  const activeReelIdRef = useRef<string | null>(null);
  const scrollRafRef = useRef<number | null>(null);
  const snapLockRef = useRef(false);
  const [slideHeightPx, setSlideHeightPx] = useState(0);

  const unlockSound = useCallback(() => setSoundUnlocked(true), []);

  useEffect(() => {
    if (!isTabActive) return;
    refreshFromServer();
  }, [refreshFromServer, isTabActive]);

  useEffect(() => {
    document.documentElement.classList.add("retweet-overscroll-lock");
    return () => document.documentElement.classList.remove("retweet-overscroll-lock");
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onStart = (e: TouchEvent) => {
      pullRef.current = { y0: e.touches[0].clientY, active: el.scrollTop <= 0 };
    };
    const onEnd = (e: TouchEvent) => {
      if (!pullRef.current.active) return;
      pullRef.current.active = false;
      const dy = (e.changedTouches[0]?.clientY ?? pullRef.current.y0) - pullRef.current.y0;
      if (el.scrollTop <= 0 && dy > 72) {
        refreshFromServer();
        setReelPullHint(true);
        window.setTimeout(() => setReelPullHint(false), 1200);
      }
    };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchend", onEnd);
    };
  }, [refreshFromServer]);

  const allReels = useMemo(() => {
    const seen = new Set<string>();
    return state.posts
      .filter(p => {
        if (!p?.id || !isReelFeedPost(p) || seen.has(p.id)) return false;
        seen.add(p.id);
        const author = userById(state, p.userId);
        if (!author) return true;
        if (author.blocked.includes(me.id) || me.blocked.includes(author.id)) return false;
        return true;
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [state.posts, state.users, me.id, me.blocked]);

  const reels = tab === "friends" ? allReels.filter(p => me.following.includes(p.userId)) : allReels;
  /** التبويب الافتراضي «ريلز» = خلاصة عامة لكل المستخدمين */

  const reelIdSetKey = useMemo(() => reels.map(r => r.id).sort().join("|"), [reels]);

  useLayoutEffect(() => {
    if (!isTabActive) return;
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => {
      const h = el.clientHeight;
      if (h > 0) setSlideHeightPx(h);
    };
    measure();
    requestAnimationFrame(measure);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [isTabActive, tab, reelPullHint, reelIdSetKey]);

  useEffect(() => {
    const first = reels[0]?.id ?? null;
    if (!first) {
      setActiveReelId(null);
      activeReelIdRef.current = null;
      return;
    }
    if (!activeReelIdRef.current || !reels.some(r => r.id === activeReelIdRef.current)) {
      setActiveReelId(first);
      activeReelIdRef.current = first;
      const el = scrollRef.current;
      if (el && slideHeightPx > 0) el.scrollTo({ top: 0, behavior: "auto" });
      else if (el) el.scrollTop = 0;
    }
  }, [reelIdSetKey, tab, slideHeightPx]);

  useEffect(() => {
    activeReelIdRef.current = activeReelId;
  }, [activeReelId]);

  const snapToNearestReel = useCallback(
    (behavior: ScrollBehavior = "auto") => {
      const root = scrollRef.current;
      const h = slideHeightPx;
      if (!root || h <= 0 || reels.length === 0 || snapLockRef.current) return;
      const idx = Math.min(reels.length - 1, Math.max(0, Math.round(root.scrollTop / h)));
      const targetTop = idx * h;
      const id = reels[idx]!.id;
      if (Math.abs(root.scrollTop - targetTop) > 2) {
        snapLockRef.current = true;
        root.scrollTo({ top: targetTop, behavior });
        window.setTimeout(() => {
          snapLockRef.current = false;
        }, behavior === "smooth" ? 320 : 48);
      }
      if (id !== activeReelIdRef.current) {
        activeReelIdRef.current = id;
        setActiveReelId(id);
      }
    },
    [reels, slideHeightPx],
  );

  const syncActiveReelFromScroll = useCallback(() => {
    const root = scrollRef.current;
    const h = slideHeightPx;
    if (!root || h <= 0 || reels.length === 0) return;
    const idx = Math.min(reels.length - 1, Math.max(0, Math.round(root.scrollTop / h)));
    const id = reels[idx]!.id;
    if (id !== activeReelIdRef.current) {
      activeReelIdRef.current = id;
      setActiveReelId(id);
    }
  }, [reels, slideHeightPx]);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root || reels.length === 0 || slideHeightPx <= 0) return;

    const onScroll = () => {
      if (snapLockRef.current) return;
      if (scrollRafRef.current != null) cancelAnimationFrame(scrollRafRef.current);
      scrollRafRef.current = requestAnimationFrame(() => {
        scrollRafRef.current = null;
        syncActiveReelFromScroll();
      });
    };

    const onScrollEnd = () => snapToNearestReel("auto");
    const onTouchEnd = () => {
      window.setTimeout(() => {
        const h = slideHeightPx;
        if (!root || h <= 0) return;
        const off = root.scrollTop % h;
        if (off > 6 && off < h - 6) snapToNearestReel("auto");
      }, 80);
    };

    root.addEventListener("scroll", onScroll, { passive: true });
    root.addEventListener("scrollend", onScrollEnd, { passive: true });
    root.addEventListener("touchend", onTouchEnd, { passive: true });
    syncActiveReelFromScroll();

    return () => {
      root.removeEventListener("scroll", onScroll);
      root.removeEventListener("scrollend", onScrollEnd);
      root.removeEventListener("touchend", onTouchEnd);
      if (scrollRafRef.current != null) cancelAnimationFrame(scrollRafRef.current);
    };
  }, [reelIdSetKey, slideHeightPx, syncActiveReelFromScroll, snapToNearestReel]);

  useLayoutEffect(() => {
    if (!restoreFromProfileContext || restoreFromProfileContext.tab !== "reels") return;
    const d = restoreFromProfileContext;
    onConsumedRestoreFromProfile?.();
    if (!d.postId) return;
    const p = state.posts.find(x => x.id === d.postId);
    if (!p || !isReelFeedPost(p)) return;
    if (d.commentsOpen) setCommentsFor(p);
    else setCommentsFor(null);
    setActiveReelId(p.id);
    activeReelIdRef.current = p.id;
    queueMicrotask(() => {
      const root = scrollRef.current;
      const h = slideHeightPx;
      if (!root || h <= 0) return;
      const idx = reels.findIndex(r => r.id === d.postId);
      if (idx < 0) return;
      root.scrollTo({ top: idx * h, behavior: "auto" });
    });
  }, [restoreFromProfileContext, state.posts, onConsumedRestoreFromProfile, reels, slideHeightPx]);

  const effectiveSoundOn = soundOn && soundUnlocked;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-black text-white overscroll-none">
      <div className="shrink-0 flex border-b border-white/10 z-20 bg-black">
        <button
          type="button"
          onClick={() => setTab("all")}
          className={"flex-1 py-3 text-sm font-semibold " + (tab === "all" ? "border-b-2 border-white" : "text-white/60")}
        >
          ريلز
        </button>
        <button
          type="button"
          onClick={() => setTab("friends")}
          className={"flex-1 py-3 text-sm font-semibold " + (tab === "friends" ? "border-b-2 border-white" : "text-white/60")}
        >
          فريند
        </button>
        {reels.length > 0 && (
          <button
            type="button"
            onClick={() => {
              unlockSound();
              setSoundOn(s => !s);
            }}
            className="px-3 py-3 text-white/80 hover:text-white"
            aria-label={soundOn ? "كتم الصوت" : "تشغيل الصوت"}
          >
            {soundOn && effectiveSoundOn ? <Volume2 size={22} /> : <VolumeX size={22} />}
          </button>
        )}
      </div>

      {reelPullHint && (
        <div className="shrink-0 text-center text-xs py-1.5 bg-white/10 text-white border-b border-white/10">
          تم تحديث الريلز
        </div>
      )}

      <div
        ref={scrollRef}
        data-no-tab-swipe
        className="reels-snap-viewport no-scrollbar mx-auto h-0 min-h-0 w-full max-w-md flex-1 basis-0 overflow-y-scroll overscroll-none"
        onPointerDown={unlockSound}
        onTouchStart={unlockSound}
      >
        {reels.length === 0 && (
          <p
            className="flex items-center justify-center text-center text-white/70 px-4"
            style={{ minHeight: REEL_SLIDE_HEIGHT_FALLBACK }}
          >
            {t("noReels")}
          </p>
        )}
        {reels.map(r => {
          const slideH = slideHeightPx > 0 ? slideHeightPx : undefined;
          const u = userById(state, r.userId);
          const media = normalizePostMedia(r);
          const liked = r.likes.includes(me.id);
          const reposted = r.reposts.includes(me.id);
          const notes = visibleMediaNotes(state, "post", r.id, me.id).slice(0, 8);
          const isActive = isTabActive && activeReelId === r.id;
          return (
            <ReelSlide key={r.id} reelId={r.id} slideHeightPx={slideH ?? 0}>
              <div className="relative h-full w-full min-h-0">
                <ReelMediaPlayer media={media} active={isActive} soundOn={effectiveSoundOn} />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent pointer-events-none" />
                {r.userId === me.id && (
                  <div className="absolute top-4 end-4 z-20">
                    <button
                      type="button"
                      onClick={() => setReelMenuId(reelMenuId === r.id ? null : r.id)}
                      className="rounded-full bg-black/45 p-2 text-white backdrop-blur-sm"
                      aria-label="خيارات الريل"
                    >
                      <MoreVertical size={22} />
                    </button>
                    {reelMenuId === r.id && (
                      <PostOptionsMenu
                        post={r}
                        onClose={() => setReelMenuId(null)}
                        onDeleted={() => {
                          setReelMenuId(null);
                          if (commentsFor?.id === r.id) setCommentsFor(null);
                        }}
                      />
                    )}
                  </div>
                )}

                <div
                  className="absolute inset-x-4 z-10 flex items-end justify-between pointer-events-none"
                  style={{ bottom: "max(1.25rem, calc(var(--retweet-nav-float-inset, 3.5rem) + 12px))" }}
                >
                  <div className="bg-black/35 backdrop-blur-md rounded-2xl p-3 max-w-[72%] border border-white/10 pointer-events-auto">
                    {notes.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-2 max-h-16 overflow-y-auto no-scrollbar">
                        {notes.map(n => {
                          const nu = userById(state, n.authorId);
                          if (!nu) return null;
                          const show = n.authorId === me.id || isMutual(state, me.id, n.authorId);
                          if (!show) return null;
                          const canReplyNote = n.authorId !== me.id;
                          return (
                            <div
                              key={n.id}
                              className="flex items-center gap-1.5 bg-black/55 rounded-full ps-1 pe-2 py-0.5 border border-white/15 max-w-[min(100%,14rem)]"
                            >
                              <button
                                type="button"
                                onClick={() => onOpenProfile(nu.id, { tab: "reels" })}
                                className="shrink-0 ring-1 ring-white/30 rounded-full"
                              >
                                <Avatar name={nu.username} src={nu.avatar} size={22} />
                              </button>
                              {canReplyNote ? (
                                <button
                                  type="button"
                                  title="رد في الخاص"
                                  onClick={() => {
                                    if (guestBlock()) return;
                                    setNoteToReply(n);
                                  }}
                                  className="text-[10px] leading-snug text-white/95 line-clamp-2 text-start hover:underline"
                                >
                                  {n.text}
                                </button>
                              ) : (
                                <span className="text-[10px] leading-snug text-white/95 line-clamp-2">{n.text}</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => u && onOpenProfile(u.id, { tab: "reels" })}
                      className="font-semibold block text-start inline-flex items-center gap-1"
                    >
                      @{u?.username ?? "user"}
                      {u && <VerifiedMarkForUser user={u} size={16} />}
                    </button>
                    {r.text ? <div className="text-sm line-clamp-3">{r.text}</div> : null}
                  </div>
                  <div className="flex flex-col gap-3 items-center bg-black/35 backdrop-blur-md rounded-2xl p-2 border border-white/10 pointer-events-auto">
                    <button
                      type="button"
                      onClick={() => {
                        if (guestBlock()) return;
                        toggleLike(r.id);
                      }}
                      className="flex flex-col items-center w-12 h-12 justify-center"
                    >
                      <Heart size={28} className={liked ? "fill-[var(--color-like)] stroke-[var(--color-like)]" : ""} />
                      <span className="text-xs">{r.likes.length}</span>
                    </button>
                    <button type="button" onClick={() => setCommentsFor(r)} className="flex flex-col items-center w-12 h-12 justify-center">
                      <MessageCircle size={28} />
                      <span className="text-xs">{r.comments.length}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (guestBlock()) return;
                        toggleRepost(r.id);
                      }}
                      className={"flex flex-col items-center w-12 h-12 justify-center " + (reposted ? "text-sky-400" : "")}
                    >
                      <Repeat2 size={26} />
                      <span className="text-xs">{r.reposts.length}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (guestBlock()) return;
                        setSharePost(r);
                      }}
                      className="w-12 h-12 flex items-center justify-center"
                    >
                      <Send size={26} />
                    </button>
                  </div>
                </div>
              </div>
            </ReelSlide>
          );
        })}
        {reels.length > 0 && slideHeightPx <= 0 && isTabActive && (
          <div
            className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black text-white/50 text-sm"
            aria-hidden
          >
            …
          </div>
        )}
      </div>

      {sharePost && <ShareSheet target={{ kind: "post", post: sharePost }} onClose={() => setSharePost(null)} />}

      <NoteReplySheet note={noteToReply} contentLabelAr="الريلز" onClose={() => setNoteToReply(null)} onSent={onOpenChat} />

      {commentsFor && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end" onClick={() => setCommentsFor(null)}>
          <div
            className="bg-background text-foreground w-full max-w-md mx-auto rounded-t-3xl max-h-[65vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-3 border-b border-border">
              <span className="font-semibold text-sm">تعليقات الريلز</span>
              <button type="button" onClick={() => setCommentsFor(null)} aria-label="إغلاق">
                <X size={22} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {commentsFor.comments.map(c => {
                const cu = userById(state, c.userId);
                return (
                  <div key={c.id} className="relative flex gap-2 text-sm">
                    <button
                      type="button"
                      onClick={() => cu && onOpenProfile(cu.id, { postId: commentsFor.id, tab: "reels", commentsOpen: true })}
                    >
                      <Avatar name={cu?.username || "?"} src={cu?.avatar} size={32} />
                    </button>
                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        className="font-semibold"
                        onClick={() => cu && onOpenProfile(cu.id, { postId: commentsFor.id, tab: "reels", commentsOpen: true })}
                      >
                        @{cu?.username}
                      </button>{" "}
                      <span>{c.text}</span>
                    </div>
                    {c.userId === me.id && (
                      <div className="relative shrink-0">
                        <button
                          type="button"
                          onClick={() => setCommentMenuId(commentMenuId === c.id ? null : c.id)}
                          className="rounded-full p-1 text-muted-foreground hover:bg-secondary"
                          aria-label="خيارات التعليق"
                        >
                          <MoreVertical size={18} />
                        </button>
                        {commentMenuId === c.id && commentsFor && (
                          <CommentOptionsMenu
                            postId={commentsFor.id}
                            commentId={c.id}
                            authorId={c.userId}
                            onClose={() => setCommentMenuId(null)}
                          />
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {commentsFor.comments.length === 0 && (
                <p className="text-center text-muted-foreground text-sm py-4">لا تعليقات بعد</p>
              )}
            </div>
            {!isGuest ? (
              <form
                className="p-3 border-t border-border flex gap-2"
                onSubmit={e => {
                  e.preventDefault();
                  if (!commentDraft.trim()) return;
                  addComment(commentsFor.id, commentDraft);
                  setCommentDraft("");
                }}
              >
                <input
                  value={commentDraft}
                  onChange={e => setCommentDraft(e.target.value)}
                  placeholder="أضف تعليقاً..."
                  className="flex-1 bg-input rounded-full px-4 py-2 text-sm outline-none"
                />
                <button type="submit" className="text-primary font-semibold text-sm px-2">
                  إرسال
                </button>
              </form>
            ) : (
              <p className="border-t border-border p-3 text-center text-xs text-muted-foreground">
                سجّل الدخول للتعليق أو التفاعل.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
