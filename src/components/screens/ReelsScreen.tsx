import { useEffect, useMemo, useRef, useState } from "react";
import { useApp, userById, visibleMediaNotes, isMutual } from "@/lib/store";
import { notifyGuestActionBlocked } from "@/lib/guestBlocked";
import type { MediaNote, ProfileReturnContext } from "@/lib/types";
import { NoteReplySheet } from "../NoteReplySheet";
import { useT } from "@/lib/i18n";
import { Avatar } from "../Avatar";
import { ShareSheet } from "../ShareSheet";
import { Heart, MessageCircle, Send, Repeat2, X } from "lucide-react";
import { VerifiedMarkForUser } from "../VerifiedBadge";
import { isRenderableMediaUrl } from "@/lib/mediaUrl";

export function ReelsScreen({
  onOpenProfile,
  onOpenChat,
}: {
  onOpenProfile: (id: string, ctx?: ProfileReturnContext) => void;
  onOpenChat: (chatId: string) => void;
}) {
  const { state, toggleLike, toggleRepost, currentUser, addComment, isGuest } = useApp();
  const t = useT();
  const me = currentUser!;
  const guestBlock = () => {
    if (!isGuest) return false;
    notifyGuestActionBlocked();
    return true;
  };
  const [tab, setTab] = useState<"all" | "friends">("all");
  const [sharePost, setSharePost] = useState<(typeof state.posts)[0] | null>(null);
  const [commentsFor, setCommentsFor] = useState<(typeof state.posts)[0] | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [noteToReply, setNoteToReply] = useState<MediaNote | null>(null);
  const [reelRefresh, setReelRefresh] = useState(0);
  const [reelPullHint, setReelPullHint] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pullRef = useRef({ y0: 0, active: false });

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
        setReelRefresh(k => k + 1);
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
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent<ProfileReturnContext>).detail;
      if (!d || d.tab !== "reels") return;
      const p = state.posts.find(x => x.id === d.postId);
      if (!p || p.type !== "reel") return;
      if (d.commentsOpen) setCommentsFor(p);
      else setCommentsFor(null);
      queueMicrotask(() => {
        document.querySelector(`[data-reel-id="${d.postId}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      });
    };
    window.addEventListener("retweet-restore-post", handler);
    return () => window.removeEventListener("retweet-restore-post", handler);
  }, [state.posts]);

  const allReels = useMemo(
    () =>
      state.posts
        .filter(p => p.type === "reel")
        .filter(p => {
          const author = userById(state, p.userId);
          if (!author) return false;
          if (author.blocked.includes(me.id) || me.blocked.includes(author.id)) return false;
          if (author.isPrivate && p.userId !== me.id && !author.followers.includes(me.id)) return false;
          return true;
        })
        .sort((a, b) => b.createdAt - a.createdAt),
    [state.posts, me.id, me.blocked, me.following, reelRefresh],
  );

  const reels = tab === "friends"
    ? allReels.filter(p => me.following.includes(p.userId))
    : allReels;

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] bg-black text-white">
      <div className="shrink-0 flex border-b border-white/10 z-20">
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
      </div>

      {reelPullHint && (
        <div className="shrink-0 text-center text-xs py-1.5 bg-white/10 text-white border-b border-white/10">تم تحديث الريلز</div>
      )}

      <div ref={scrollRef} className="snap-y snap-mandatory flex-1 overflow-y-auto">
        {reels.length === 0 && <p className="text-center text-white/70 py-12">{t("noReels")}</p>}
        {reels.map(r => {
          const u = userById(state, r.userId);
          const liked = r.likes.includes(me.id);
          const reposted = r.reposts.includes(me.id);
          const notes = visibleMediaNotes(state, "post", r.id, me.id).slice(0, 8);
          return (
            <div key={r.id} data-reel-id={r.id} className="snap-start min-h-[calc(100vh-200px)] relative bg-black flex items-center justify-center">
              {r.video && isRenderableMediaUrl(r.video) ? (
                <video src={r.video} autoPlay loop muted playsInline className="absolute inset-0 w-full h-full object-cover" />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-5xl text-white/90">{r.video && !isRenderableMediaUrl(r.video) ? r.video : "🎬"}</div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent pointer-events-none" />

              <div className="absolute bottom-6 inset-x-4 flex justify-between items-end z-10 pointer-events-none">
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
                            <button type="button" onClick={() => onOpenProfile(nu.id, { postId: r.id, tab: "reels", commentsOpen: false })} className="shrink-0 ring-1 ring-white/30 rounded-full">
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
                  <button type="button" onClick={() => u && onOpenProfile(u.id, { postId: r.id, tab: "reels", commentsOpen: false })} className="font-semibold block text-start inline-flex items-center gap-1">
                    @{u?.username}
                    {u && <VerifiedMarkForUser user={u} size={16} />}
                  </button>
                  <div className="text-sm line-clamp-3">{r.text}</div>
                </div>
                <div className="flex flex-col gap-3 items-center bg-black/35 backdrop-blur-md rounded-2xl p-2 border border-white/10 pointer-events-auto">
                  <button type="button" onClick={() => { if (guestBlock()) return; toggleLike(r.id); }} className="flex flex-col items-center w-12 h-12 justify-center">
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
                  <button type="button" onClick={() => { if (guestBlock()) return; setSharePost(r); }} className="w-12 h-12 flex items-center justify-center">
                    <Send size={26} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {sharePost && <ShareSheet target={{ kind: "post", post: sharePost }} onClose={() => setSharePost(null)} />}

      <NoteReplySheet
        note={noteToReply}
        contentLabelAr="الريلز"
        onClose={() => setNoteToReply(null)}
        onSent={onOpenChat}
      />

      {commentsFor && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end" onClick={() => setCommentsFor(null)}>
          <div className="bg-background text-foreground w-full max-w-md mx-auto rounded-t-3xl max-h-[65vh] flex flex-col" onClick={e => e.stopPropagation()}>
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
                  <div key={c.id} className="flex gap-2 text-sm">
                    <button type="button" onClick={() => cu && commentsFor && onOpenProfile(cu.id, { postId: commentsFor.id, tab: "reels", commentsOpen: true })}>
                      <Avatar name={cu?.username || "?"} src={cu?.avatar} size={32} />
                    </button>
                    <div>
                      <button
                        type="button"
                        className="font-semibold"
                        onClick={() => cu && commentsFor && onOpenProfile(cu.id, { postId: commentsFor.id, tab: "reels", commentsOpen: true })}
                      >
                        @{cu?.username}
                      </button>{" "}
                      <span>{c.text}</span>
                    </div>
                  </div>
                );
              })}
              {commentsFor.comments.length === 0 && <p className="text-center text-muted-foreground text-sm py-4">لا تعليقات بعد</p>}
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
              <p className="border-t border-border p-3 text-center text-xs text-muted-foreground">سجّل الدخول للتعليق أو التفاعل.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
