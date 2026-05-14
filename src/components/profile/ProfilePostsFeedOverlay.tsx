import { useEffect, useLayoutEffect, useMemo, useRef, useState, startTransition } from "react";
import { useApp, userById, visibleMediaNotes, isMutual } from "@/lib/store";
import { formatRelativeTime } from "@/lib/formatRelativeTime";
import { useT } from "@/lib/i18n";
import { Avatar } from "../Avatar";
import { ShareSheet } from "../ShareSheet";
import { Heart, MessageCircle, Repeat2, Send, X, AtSign } from "lucide-react";
import { VerifiedMarkForUser } from "../VerifiedBadge";
import type { MediaNote, Post, ProfileGridTab, ProfileReturnContext } from "@/lib/types";
import { NoteReplySheet } from "../NoteReplySheet";
import { isRenderableMediaUrl } from "@/lib/mediaUrl";
import { renderMentionHashtagNodes } from "@/lib/renderMentionHashtagText";

function PostFeedBlock({
  post,
  profileOwnerId,
  gridTab,
  onOpenProfile,
  onOpenChat,
}: {
  post: Post;
  profileOwnerId: string;
  gridTab: ProfileGridTab;
  onOpenProfile: (id: string, ctx?: ProfileReturnContext) => void;
  onOpenChat: (chatId: string) => void;
}) {
  const { state, currentUser, toggleLike, toggleRepost, addComment } = useApp();
  const [noteToReply, setNoteToReply] = useState<MediaNote | null>(null);
  const [comment, setComment] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const lang = state.language;
  const t = useT();
  const me = currentUser!;
  const author = userById(state, post.userId);
  const liked = post.likes.includes(me.id);
  const reposted = post.reposts.includes(me.id);
  const postKindAr = post.type === "tweet" ? "التغريدة" : post.type === "reel" ? "الريلز" : "المنشور";
  const detailNotes = visibleMediaNotes(state, "post", post.id, me.id).slice(0, 8).filter(n => {
    const nu = userById(state, n.authorId);
    return nu && (n.authorId === me.id || isMutual(state, me.id, n.authorId));
  });

  const returnCtx = (commentsOpen?: boolean): ProfileReturnContext => ({
    postId: post.id,
    tab: "profile",
    commentsOpen: !!commentsOpen,
    profileUserId: profileOwnerId,
    profileGridTab: gridTab,
  });

  const renderedPostText = useMemo(() => {
    if (!post.text) return null;
    return renderMentionHashtagNodes(post.text, {
      renderMention: (uname, key) => {
        const u = state.users.find((x) => x.username === uname);
        if (u) {
          return (
            <button
              key={key}
              type="button"
              onClick={() => startTransition(() => onOpenProfile(u.id, returnCtx(false)))}
              className="text-primary"
            >
              <AtSign size={12} className="inline" />
              {uname}
            </button>
          );
        }
        return (
          <span key={key} className="text-primary">
            @{uname}
          </span>
        );
      },
      renderHashtag: (h, key) => (
        <span key={key} className="text-primary">
          {h}
        </span>
      ),
    });
  }, [post.text, state.users, onOpenProfile]);

  if (!author) return null;

  return (
    <div dir="auto" className="flex min-h-0 flex-col">
      {detailNotes.length > 0 && (
        <div className="px-4 pb-2 pt-2 flex gap-2 overflow-x-auto no-scrollbar border-b border-border/60">
          {detailNotes.map(n => {
            const nu = userById(state, n.authorId)!;
            const canReplyNote = n.authorId !== me.id;
            return (
              <div key={n.id} className="flex flex-col items-center shrink-0 max-w-[4rem]">
                {canReplyNote ? (
                  <button
                    type="button"
                    title="رد في الخاص"
                    onClick={() => setNoteToReply(n)}
                    className="text-[9px] leading-tight text-start bg-secondary rounded-lg px-1.5 py-0.5 mb-0.5 line-clamp-3 border border-border hover:bg-secondary/80"
                  >
                    {n.text}
                  </button>
                ) : (
                  <div className="text-[9px] leading-tight text-start bg-secondary rounded-lg px-1.5 py-0.5 mb-0.5 line-clamp-3 border border-border">{n.text}</div>
                )}
                <button type="button" onClick={() => startTransition(() => onOpenProfile(nu.id, returnCtx(false)))}>
                  <Avatar name={nu.username} src={nu.avatar} size={28} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-3 px-4 pt-3">
        <button type="button" onClick={() => startTransition(() => onOpenProfile(author.id, returnCtx(false)))} className="shrink-0">
          <Avatar name={author.username} src={author.avatar} size={40} />
        </button>
        <div className="flex flex-col items-start min-w-0">
          <button
            type="button"
            onClick={() => startTransition(() => onOpenProfile(author.id, returnCtx(false)))}
            className="font-semibold text-sm inline-flex items-center gap-1 truncate max-w-full"
          >
            @{author.username}
            <VerifiedMarkForUser user={author} size={16} />
          </button>
          <span className="text-xs text-muted-foreground">{formatRelativeTime(post.createdAt, lang)}</span>
        </div>
      </div>

      {post.text && (
        <p dir="auto" className="whitespace-pre-wrap px-4 py-3 text-start text-base leading-relaxed break-words">
          {renderedPostText}
        </p>
      )}
      {post.image && (
        <div className="flex items-center justify-center bg-muted">
          {isRenderableMediaUrl(post.image) ? (
            <img src={post.image} className="max-h-[55vh] w-full object-contain" alt="" />
          ) : (
            <div className="flex min-h-[8rem] items-center justify-center py-12 text-5xl">{post.image}</div>
          )}
        </div>
      )}
      {post.video && (
        <div className="flex items-center justify-center bg-black">
          {isRenderableMediaUrl(post.video) ? (
            <video src={post.video} controls className="max-h-[55vh] w-full object-contain" playsInline />
          ) : (
            <div className="flex min-h-[8rem] items-center justify-center py-12 text-5xl text-white">{post.video}</div>
          )}
        </div>
      )}

      <div className="flex items-center gap-5 px-4 pt-3">
        <button type="button" onClick={() => startTransition(() => toggleLike(post.id))} className="flex items-center gap-1">
          <Heart size={24} className={liked ? "fill-[var(--color-like)] stroke-[var(--color-like)]" : ""} />
        </button>
        <button
          type="button"
          className="flex items-center gap-1"
          onClick={() => document.getElementById(`profile-feed-comments-${post.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}
        >
          <MessageCircle size={24} />
        </button>
        <button type="button" onClick={() => startTransition(() => toggleRepost(post.id))} className={reposted ? "text-primary" : ""}>
          <Repeat2 size={24} />
        </button>
        <button type="button" className="ms-auto" onClick={() => setShareOpen(true)} aria-label="مشاركة">
          <Send size={22} />
        </button>
      </div>
      <div className="px-4 pt-2 text-sm">
        <b>{post.likes.length}</b> {t("likes")} · <b>{post.reposts.length}</b> {t("reposts")} · <b>{post.comments.length}</b> {t("comments")}
      </div>

      <div id={`profile-feed-comments-${post.id}`} className="px-4 pt-4 space-y-2 border-t border-border mt-3 scroll-mt-24 flex-1 min-h-[120px]">
        <h3 className="font-semibold text-sm">{t("comments")}</h3>
        {post.comments.map(c => {
          const u = userById(state, c.userId);
          return (
            <div key={c.id} className="text-sm flex gap-2">
              <button type="button" className="shrink-0 rounded-full" onClick={() => startTransition(() => u && onOpenProfile(u.id, returnCtx(true)))}>
                <Avatar name={u?.username || "?"} src={u?.avatar} size={28} />
              </button>
              <div className="min-w-0">
                <button type="button" className="font-semibold" onClick={() => startTransition(() => u && onOpenProfile(u.id, returnCtx(true)))}>
                  @{u?.username}
                </button>{" "}
                <span className="[overflow-wrap:break-word]">{c.text}</span>
              </div>
            </div>
          );
        })}
        {post.comments.length === 0 && <p className="text-xs text-muted-foreground">—</p>}
        <form
          onSubmit={e => {
            e.preventDefault();
            if (comment.trim()) {
              addComment(post.id, comment);
              setComment("");
            }
          }}
          className="flex gap-2 pt-3 pb-6"
        >
          <input value={comment} onChange={e => setComment(e.target.value)} placeholder={t("send")} className="flex-1 bg-input rounded-full px-4 py-2 text-sm outline-none" />
          <button type="submit" className="text-primary text-sm font-semibold shrink-0">
            {t("send")}
          </button>
        </form>
      </div>

      {shareOpen && <ShareSheet target={{ kind: "post", post }} onClose={() => setShareOpen(false)} />}

      <NoteReplySheet note={noteToReply} contentLabelAr={postKindAr} onClose={() => setNoteToReply(null)} onSent={onOpenChat} />
    </div>
  );
}

const TAB_TITLE_AR: Record<ProfileGridTab, string> = {
  posts: "المنشورات",
  reposts: "إعادات النشر",
  likes: "الإعجابات",
  favorites: "المحفوظات",
};

export function ProfilePostsFeedOverlay({
  postIds,
  initialIndex,
  profileOwnerId,
  gridTab,
  initialCommentsOpen = false,
  onClose,
  onOpenProfile,
  onOpenChat,
}: {
  postIds: string[];
  initialIndex: number;
  profileOwnerId: string;
  gridTab: ProfileGridTab;
  initialCommentsOpen?: boolean;
  onClose: () => void;
  onOpenProfile: (id: string, ctx?: ProfileReturnContext) => void;
  onOpenChat: (chatId: string) => void;
}) {
  const { state } = useApp();
  const posts = useMemo(
    () => postIds.map(id => state.posts.find(p => p.id === id)).filter((p): p is Post => !!p),
    [state.posts, postIds],
  );
  const scrollKeyRef = useRef("");

  const scrollTargetKey = `${postIds.join(",")}|${initialIndex}|${initialCommentsOpen ? "c" : "p"}`;

  useLayoutEffect(() => {
    if (posts.length === 0) return;
    if (scrollKeyRef.current === scrollTargetKey) return;
    scrollKeyRef.current = scrollTargetKey;
    const id = posts[Math.min(initialIndex, posts.length - 1)]?.id;
    if (!id) return;
    requestAnimationFrame(() => {
      const anchor = initialCommentsOpen ? `profile-feed-comments-${id}` : `profile-feed-section-${id}`;
      document.getElementById(anchor)?.scrollIntoView({ block: "start", behavior: "auto" });
    });
  }, [posts, initialIndex, initialCommentsOpen, scrollTargetKey]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
      scrollKeyRef.current = "";
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[220] flex justify-center bg-background">
      <div className="flex h-[100dvh] w-full max-w-md flex-col overflow-hidden border-x border-border shadow-xl">
        <header className="flex shrink-0 items-center gap-3 border-b border-border bg-background/95 px-3 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <button type="button" onClick={onClose} className="shrink-0 rounded-full p-2 hover:bg-secondary" aria-label="رجوع">
            <X size={22} />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-semibold">{TAB_TITLE_AR[gridTab]}</h1>
            <p className="truncate text-[11px] text-muted-foreground">مرّر لأعلى أو لأسفل بين المنشورات</p>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain [scrollbar-gutter:stable]">
          {posts.map(p => (
            <section
              key={p.id}
              id={`profile-feed-section-${p.id}`}
              className="border-b border-border last:border-b-0 min-h-[min(100dvh,880px)]"
            >
              <PostFeedBlock post={p} profileOwnerId={profileOwnerId} gridTab={gridTab} onOpenProfile={onOpenProfile} onOpenChat={onOpenChat} />
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
