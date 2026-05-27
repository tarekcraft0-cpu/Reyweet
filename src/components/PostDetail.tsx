import { useEffect, useState, startTransition, useMemo, useCallback } from "react";
import { useApp, userById, visibleMediaNotes, isMutual } from "@/lib/store";
import { notifyGuestActionBlocked } from "@/lib/guestBlocked";
import { formatRelativeTime } from "@/lib/formatRelativeTime";
import { useT } from "@/lib/i18n";
import { Avatar } from "./Avatar";
import { ShareSheet } from "./ShareSheet";
import { Heart, MessageCircle, Repeat2, Send, AtSign, MoreHorizontal, Trash2, ArrowRight } from "lucide-react";
import { SlideDismissBackButton, SlideDismissShell } from "./SlideDismissShell";
import { PostOptionsMenu } from "./PostOptionsMenu";
import { VerifiedMarkForUser } from "./VerifiedBadge";
import type { MediaNote, Post, ProfileHomeSurface, ProfileReturnContext } from "@/lib/types";
import { NoteReplySheet } from "./NoteReplySheet";
import { isRenderableMediaUrl, resolveMediaUrl } from "@/lib/mediaUrl";
import { renderMentionHashtagNodes, createMentionRenderer } from "@/lib/renderMentionHashtagText";

interface Props {
  post: Post;
  onBack: () => void;
  onOpenProfile: (id: string, ctx?: ProfileReturnContext) => void;
  onOpenChat: (chatId: string) => void;
  profileReturnTab: ProfileReturnContext["tab"];
  /** بعد الرجوع من بروفايل من التعليقات */
  initialFocusComments?: boolean;
}

export function PostDetail({ post: postProp, onBack, onOpenProfile, onOpenChat, profileReturnTab, initialFocusComments }: Props) {
  const { state, currentUser, toggleLike, toggleRepost, addComment, deleteComment, isGuest } = useApp();
  const post = useMemo(
    () => state.posts.find(p => p.id === postProp.id) ?? postProp,
    [state.posts, postProp],
  );
  const [noteToReply, setNoteToReply] = useState<MediaNote | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const lang = state.language;
  const t = useT();
  const author = userById(state, post.userId);
  const [comment, setComment] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const me = currentUser!;
  const guestBlock = () => {
    if (!isGuest) return false;
    notifyGuestActionBlocked();
    return true;
  };
  const liked = post.likes.includes(me.id);
  const reposted = post.reposts.includes(me.id);
  const postKindAr = post.type === "tweet" ? "التغريدة" : post.type === "reel" ? "الريلز" : "المنشور";
  const detailNotes = visibleMediaNotes(state, "post", post.id, me.id).slice(0, 8).filter(n => {
    const nu = userById(state, n.authorId);
    return nu && (n.authorId === me.id || isMutual(state, me.id, n.authorId));
  });

  const returnCtx = useCallback(
    (commentsOpen?: boolean): ProfileReturnContext => {
      const homeSurface: ProfileHomeSurface | undefined =
        profileReturnTab === "home" || profileReturnTab === "search" ? "post_detail_full" : undefined;
      return {
        postId: post.id,
        tab: profileReturnTab,
        commentsOpen: !!commentsOpen,
        ...(homeSurface ? { homeSurface } : {}),
      };
    },
    [post.id, profileReturnTab],
  );

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    try {
      window.dispatchEvent(new CustomEvent("retweet-post-detail-open"));
    } catch {
      /* ignore */
    }
    return () => {
      document.body.style.overflow = prev;
      try {
        window.dispatchEvent(new CustomEvent("retweet-post-detail-close"));
      } catch {
        /* ignore */
      }
    };
  }, []);

  useEffect(() => {
    if (!initialFocusComments) return;
    const t = window.setTimeout(() => {
      document.getElementById("post-comments-anchor")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
    return () => window.clearTimeout(t);
  }, [initialFocusComments]);

  const renderedPostText = useMemo(() => {
    if (!post.text) return null;
    return renderMentionHashtagNodes(post.text, {
      renderMention: createMentionRenderer({
        users: state.users,
        onUserClick: userId => startTransition(() => onOpenProfile(userId, returnCtx(false))),
      }),
      renderHashtag: (h, key) => (
        <span key={key} className="text-primary">
          {h}
        </span>
      ),
    });
  }, [post.text, state.users, onOpenProfile, returnCtx]);

  if (!author) return null;

  const submitComment = () => {
    if (guestBlock()) return;
    const text = comment.trim();
    if (!text) return;
    addComment(post.id, text);
    setComment("");
  };

  const ownerMenu =
    me.id === post.userId ? (
      <div className="relative shrink-0">
        <button
          type="button"
          onClick={() => setMenuOpen(v => !v)}
          className="rounded-full p-2 hover:bg-secondary"
          aria-label="خيارات"
        >
          <MoreHorizontal size={22} />
        </button>
        {menuOpen && <PostOptionsMenu post={post} onClose={() => setMenuOpen(false)} onDeleted={onBack} />}
      </div>
    ) : null;

  return (
    <SlideDismissShell onDismiss={onBack} variant="overlay" overlayZIndex={220} panelSwipeDismiss>
    <div className="flex h-[100dvh] w-full max-w-md flex-col overflow-hidden bg-background shadow-2xl">
      <header
        dir="rtl"
        className="shrink-0 z-20 border-b border-border bg-background/95 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/80 pt-[max(0.75rem,env(safe-area-inset-top,0px))]"
      >
        <div className="flex items-center justify-between gap-2 px-3 pb-1 sm:hidden">
          <SlideDismissBackButton
            onDismiss={onBack}
            className="shrink-0 rounded-full p-2 hover:bg-secondary active:bg-secondary/80"
            aria-label="رجوع"
          >
            <ArrowRight size={22} strokeWidth={1.75} />
          </SlideDismissBackButton>
          {ownerMenu ?? <span className="w-10 shrink-0" aria-hidden />}
        </div>
        <div className="flex min-w-0 items-center gap-2.5 px-3 pb-2.5 pt-0.5 sm:gap-3 sm:py-2">
          <SlideDismissBackButton
            onDismiss={onBack}
            className="hidden shrink-0 rounded-full p-2 hover:bg-secondary active:bg-secondary/80 sm:inline-flex"
            aria-label="رجوع"
          >
            <ArrowRight size={22} strokeWidth={1.75} />
          </SlideDismissBackButton>
          <button
            type="button"
            onClick={() => startTransition(() => onOpenProfile(author.id, returnCtx(false)))}
            className="shrink-0"
          >
            <Avatar name={author.username} src={author.avatar} size={36} />
          </button>
          <div className="min-w-0 flex-1 text-start">
            <button
              type="button"
              onClick={() => startTransition(() => onOpenProfile(author.id, returnCtx(false)))}
              className="inline-flex max-w-full items-center gap-1 truncate font-semibold text-sm leading-tight"
            >
              @{author.username}
              <VerifiedMarkForUser user={author} size={16} />
            </button>
            <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
              {formatRelativeTime(post.createdAt, lang)}
            </span>
          </div>
          {ownerMenu && <div className="hidden sm:block">{ownerMenu}</div>}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain pb-4">
      {post.text && (
        <p dir="rtl" className="whitespace-pre-wrap px-4 py-3 text-right text-base leading-relaxed break-words">
          {renderedPostText}
        </p>
      )}
      {post.image && (
        <div className="relative flex items-center justify-center bg-muted">
          {detailNotes.length > 0 && (
            <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex gap-2 overflow-x-auto bg-gradient-to-b from-black/55 via-black/25 to-transparent px-2.5 pb-8 pt-2.5">
              {detailNotes.map(n => {
                const nu = userById(state, n.authorId)!;
                const canReplyNote = n.authorId !== me.id;
                return (
                  <div key={n.id} className="pointer-events-auto flex max-w-[7.5rem] shrink-0 flex-col items-start gap-1">
                    {canReplyNote ? (
                      <button
                        type="button"
                        title="رد على النوت"
                        onClick={() => {
                          if (guestBlock()) return;
                          setNoteToReply(n);
                        }}
                        className="line-clamp-2 w-full rounded-xl border border-white/25 bg-black/45 px-2 py-1 text-start text-[11px] font-medium leading-snug text-white backdrop-blur-sm hover:bg-black/55"
                      >
                        {n.text}
                      </button>
                    ) : (
                      <div className="line-clamp-2 w-full rounded-xl border border-white/25 bg-black/45 px-2 py-1 text-start text-[11px] font-medium leading-snug text-white backdrop-blur-sm">
                        {n.text}
                      </div>
                    )}
                    <button type="button" onClick={() => startTransition(() => onOpenProfile(nu.id, returnCtx(false)))}>
                      <Avatar name={nu.username} src={nu.avatar} size={26} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {isRenderableMediaUrl(post.image) ? (
            <img src={resolveMediaUrl(post.image)} className="max-h-[70vh] w-full object-contain" alt="" />
          ) : (
            <div className="flex min-h-[10rem] items-center justify-center py-12 text-5xl">{post.image}</div>
          )}
        </div>
      )}
      {post.video && (
        <div className="relative flex items-center justify-center bg-black">
          {detailNotes.length > 0 && (
            <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex gap-2 overflow-x-auto bg-gradient-to-b from-black/55 via-black/25 to-transparent px-2.5 pb-8 pt-2.5">
              {detailNotes.map(n => {
                const nu = userById(state, n.authorId)!;
                const canReplyNote = n.authorId !== me.id;
                return (
                  <div key={n.id} className="pointer-events-auto flex max-w-[7.5rem] shrink-0 flex-col items-start gap-1">
                    {canReplyNote ? (
                      <button
                        type="button"
                        title="رد على النوت"
                        onClick={() => {
                          if (guestBlock()) return;
                          setNoteToReply(n);
                        }}
                        className="line-clamp-2 w-full rounded-xl border border-white/25 bg-black/45 px-2 py-1 text-start text-[11px] font-medium leading-snug text-white backdrop-blur-sm hover:bg-black/55"
                      >
                        {n.text}
                      </button>
                    ) : (
                      <div className="line-clamp-2 w-full rounded-xl border border-white/25 bg-black/45 px-2 py-1 text-start text-[11px] font-medium leading-snug text-white backdrop-blur-sm">
                        {n.text}
                      </div>
                    )}
                    <button type="button" onClick={() => startTransition(() => onOpenProfile(nu.id, returnCtx(false)))}>
                      <Avatar name={nu.username} src={nu.avatar} size={26} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {isRenderableMediaUrl(post.video) ? (
            <video src={resolveMediaUrl(post.video)} controls playsInline className="max-h-[70vh] w-full object-contain" />
          ) : (
            <div className="flex min-h-[10rem] items-center justify-center py-12 text-5xl text-white">{post.video}</div>
          )}
        </div>
      )}
      {!post.image && !post.video && detailNotes.length > 0 && (
        <div className="px-4 pb-2 flex gap-2 overflow-x-auto no-scrollbar">
          {detailNotes.map(n => {
            const nu = userById(state, n.authorId)!;
            const canReplyNote = n.authorId !== me.id;
            return (
              <div key={n.id} className="flex flex-col items-center shrink-0 max-w-[4rem]">
                {canReplyNote ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (guestBlock()) return;
                      setNoteToReply(n);
                    }}
                    className="text-[9px] leading-tight text-start bg-secondary rounded-lg px-1.5 py-0.5 mb-0.5 line-clamp-3 border border-border"
                  >
                    {n.text}
                  </button>
                ) : (
                  <div className="text-[9px] leading-tight text-start bg-secondary rounded-lg px-1.5 py-0.5 mb-0.5 line-clamp-3 border border-border">
                    {n.text}
                  </div>
                )}
                <button type="button" onClick={() => startTransition(() => onOpenProfile(nu.id, returnCtx(false)))}>
                  <Avatar name={nu.username} src={nu.avatar} size={28} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-5 px-4 pt-3">
        <button type="button" onClick={() => { if (guestBlock()) return; startTransition(() => toggleLike(post.id)); }} className="flex items-center gap-1">
          <Heart size={24} className={liked ? "fill-[var(--color-like)] stroke-[var(--color-like)]" : ""} />
        </button>
        <button className="flex items-center gap-1"><MessageCircle size={24} /></button>
        <button type="button" onClick={() => { if (guestBlock()) return; startTransition(() => toggleRepost(post.id)); }} className={reposted ? "text-primary" : ""}><Repeat2 size={24} /></button>
        <button type="button" className="ms-auto" onClick={() => { if (guestBlock()) return; setShareOpen(true); }} aria-label="مشاركة">
          <Send size={22} />
        </button>
      </div>
      <div className="px-4 pt-2 text-sm space-y-1">
        <div><b>{post.likes.length}</b> {t("likes")} · <b>{post.reposts.length}</b> {t("reposts")} · <b>{post.comments.length}</b> {t("comments")}</div>
      </div>

      <div className="px-4 pt-3 space-y-2 border-t border-border mt-3 pb-2">
        <h3 id="post-comments-anchor" className="font-semibold text-sm pt-2 scroll-mt-24 sm:scroll-mt-20">{t("comments")}</h3>
        {post.comments.map(c => {
          const u = userById(state, c.userId);
          return (
            <div key={c.id} className="relative flex gap-2 text-sm">
              <button type="button" className="shrink-0 rounded-full" onClick={() => startTransition(() => u && onOpenProfile(u.id, returnCtx(true)))}>
                <Avatar name={u?.username || "?"} src={u?.avatar} size={28} />
              </button>
              <div className="min-w-0 flex-1">
                <button type="button" className="font-semibold" onClick={() => startTransition(() => u && onOpenProfile(u.id, returnCtx(true)))}>
                  @{u?.username}
                </button>{" "}
                <span dir="auto" className="break-words">
                  {c.text}
                </span>
              </div>
              {c.userId === me.id && (
                <button
                  type="button"
                  onClick={() => {
                    if (!window.confirm("حذف هذا التعليق؟")) return;
                    deleteComment(post.id, c.id);
                  }}
                  className="shrink-0 rounded-full p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  aria-label="حذف التعليق"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          );
        })}
        {post.comments.length === 0 && <p className="text-xs text-muted-foreground">—</p>}
      </div>

      {shareOpen && <ShareSheet target={{ kind: "post", post }} onClose={() => setShareOpen(false)} />}

      <NoteReplySheet
        note={noteToReply}
        contentLabelAr={postKindAr}
        onClose={() => setNoteToReply(null)}
        onSent={onOpenChat}
      />
      </div>

      <form
        onSubmit={e => {
          e.preventDefault();
          submitComment();
        }}
        className="flex shrink-0 gap-2 border-t border-border bg-background px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]"
      >
        <input
          value={comment}
          onChange={e => setComment(e.target.value)}
          placeholder="أضف تعليقاً..."
          className="flex-1 rounded-full bg-input px-4 py-2.5 text-sm outline-none"
        />
        <button
          type="submit"
          disabled={!comment.trim()}
          className="shrink-0 text-sm font-semibold text-primary disabled:opacity-40"
        >
          {t("send")}
        </button>
      </form>
    </div>
    </SlideDismissShell>
  );
}
