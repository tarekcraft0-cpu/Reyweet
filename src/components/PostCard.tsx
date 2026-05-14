import { useState, startTransition, useMemo } from "react";
import { useApp, userById, visibleMediaNotes, isMutual } from "@/lib/store";
import { notifyGuestActionBlocked } from "@/lib/guestBlocked";
import { formatRelativeTime } from "@/lib/formatRelativeTime";
import type { MediaNote, Post } from "@/lib/types";
import { Avatar } from "./Avatar";
import { NoteReplySheet } from "./NoteReplySheet";
import { Heart, MessageCircle, Repeat2, Send, Bookmark, AtSign } from "lucide-react";
import { VerifiedMarkForUser } from "./VerifiedBadge";
import { isRenderableMediaUrl } from "@/lib/mediaUrl";
import { renderMentionHashtagNodes } from "@/lib/renderMentionHashtagText";

interface Props {
  post: Post;
  onShare: (post: Post) => void;
  onOpenProfile: (userId: string) => void;
  /** فتح المنشور كامل الشاشة (الوسائط/النص/المساحة الفارغة للمحتوى) */
  onOpen: () => void;
  /** إن وُجدت: أيقونة التعليقات تفتح ورقة من الأسفل بدل صفحة المنشور */
  onOpenCommentsSheet?: () => void;
  /** إخفاء حقل التعليق السريع أسفل الكرت (التعليق يكون في الورقة) */
  hideQuickComment?: boolean;
  onOpenChat?: (chatId: string) => void;
}

export function PostCard({ post, onShare, onOpenProfile, onOpen, onOpenCommentsSheet, hideQuickComment, onOpenChat }: Props) {
  const { state, currentUser, toggleLike, toggleFavorite, toggleRepost, addComment, isGuest } = useApp();
  const [noteToReply, setNoteToReply] = useState<MediaNote | null>(null);
  const lang = state.language;
  const author = userById(state, post.userId);
  const [comment, setComment] = useState("");
  const guestBlock = () => {
    if (!isGuest) return false;
    notifyGuestActionBlocked();
    return true;
  };
  const liked = currentUser ? post.likes.includes(currentUser.id) : false;
  const reposted = currentUser ? post.reposts.includes(currentUser.id) : false;
  const favorited = currentUser ? currentUser.favorites.includes(post.id) : false;
  const feedNotesRaw = currentUser ? visibleMediaNotes(state, "post", post.id, currentUser.id).slice(0, 5) : [];
  const feedNotes = feedNotesRaw.filter(n => {
    const nu = userById(state, n.authorId);
    return nu && (n.authorId === currentUser!.id || isMutual(state, currentUser!.id, n.authorId));
  });
  if (!author) return null;

  const postKindAr = post.type === "tweet" ? "التغريدة" : post.type === "reel" ? "الريلز" : "المنشور";

  const firstHashtag = useMemo(() => {
    if (!post.text?.trim()) return null;
    const m = post.text.match(/#[\w\u0600-\u06FF]+/);
    return m ? m[0] : null;
  }, [post.text]);

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
              onClick={(e) => {
                e.stopPropagation();
                startTransition(() => onOpenProfile(u.id));
              }}
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

  return (
    <article dir="auto" className="border-b border-border pb-4">
      <header className="flex items-start gap-3 px-4 py-3">
        <button type="button" onClick={() => startTransition(() => onOpenProfile(author.id))} className="shrink-0 pt-0.5">
          <Avatar name={author.username} src={author.avatar} size={36} />
        </button>
        <div className="min-w-0 flex-1 flex flex-col gap-1 text-start">
          <button
            type="button"
            onClick={() => startTransition(() => onOpenProfile(author.id))}
            className="inline-flex max-w-full items-center gap-1 self-start text-start font-semibold text-sm"
          >
            @{author.username}
            <VerifiedMarkForUser user={author} size={16} />
          </button>
          {firstHashtag ? (
            <button type="button" onClick={onOpen} className="max-w-full self-start text-start text-sm font-medium text-primary hover:underline">
              <span className="line-clamp-2">{firstHashtag}</span>
            </button>
          ) : (
            <button type="button" onClick={onOpen} className="self-start text-xs text-muted-foreground hover:underline">
              عرض المنشور كاملًا
            </button>
          )}
          <button type="button" onClick={onOpen} className="self-start text-xs text-muted-foreground tabular-nums">
            {post.type === "tweet" ? "تغريدة" : post.type === "reel" ? "ريلز" : "منشور"}
            {" · "}
            {formatRelativeTime(post.createdAt, lang)}
          </button>
        </div>
      </header>

      {feedNotes.length > 0 && (
        <div className="px-4 pb-2 flex gap-2 overflow-x-auto no-scrollbar">
          {feedNotes.map(n => {
            const nu = userById(state, n.authorId)!;
            const canReplyNote = !!onOpenChat && n.authorId !== currentUser!.id;
            return (
              <div key={n.id} className="flex flex-col items-center shrink-0 max-w-[3.5rem]">
                {canReplyNote ? (
                  <button
                    type="button"
                    title="رد في الخاص"
                    onClick={e => {
                      e.stopPropagation();
                      if (guestBlock()) return;
                      setNoteToReply(n);
                    }}
                    className="text-[9px] leading-tight text-start bg-secondary rounded-lg px-1 py-0.5 mb-0.5 line-clamp-2 border border-border w-full hover:bg-secondary/80 active:scale-[0.98]"
                  >
                    {n.text}
                  </button>
                ) : (
                  <div className="text-[9px] leading-tight text-start bg-secondary rounded-lg px-1 py-0.5 mb-0.5 line-clamp-2 border border-border w-full">{n.text}</div>
                )}
                <button type="button" onClick={e => { e.stopPropagation(); startTransition(() => onOpenProfile(nu.id)); }}>
                  <Avatar name={nu.username} src={nu.avatar} size={28} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {post.text && (
        <p
          onClick={onOpen}
          dir="auto"
          className="cursor-pointer whitespace-pre-wrap px-4 pb-3 text-start text-sm leading-relaxed break-words"
        >
          {renderedPostText}
        </p>
      )}

      {!post.image && !post.video && !post.text && (
        <button
          type="button"
          onClick={onOpen}
          className="mx-4 mb-1 min-h-[100px] w-[calc(100%-2rem)] rounded-2xl bg-muted/50 border border-border/60 text-muted-foreground text-xs flex items-center justify-center cursor-pointer hover:bg-muted/70 active:scale-[0.99]"
        >
          اضغط للمنشور كامل
        </button>
      )}

      {post.image && (
        <div onClick={onOpen} className="mx-4 aspect-square cursor-pointer overflow-hidden rounded-2xl bg-muted">
          {isRenderableMediaUrl(post.image) ? (
            <img src={post.image} className="h-full w-full object-cover" alt="" />
          ) : (
            <div className="flex h-full min-h-[8rem] items-center justify-center text-5xl">{post.image}</div>
          )}
        </div>
      )}
      {post.video && (
        <div onClick={onOpen} className="mx-4 aspect-video cursor-pointer overflow-hidden rounded-2xl bg-black">
          {isRenderableMediaUrl(post.video) ? (
            <video src={post.video} controls playsInline className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full min-h-[8rem] items-center justify-center bg-muted text-5xl">{post.video || "🎬"}</div>
          )}
        </div>
      )}

      <div className="flex items-center gap-5 px-4 pt-3">
        <button type="button" onClick={() => { if (guestBlock()) return; startTransition(() => toggleLike(post.id)); }} className="flex items-center gap-1">
          <Heart size={22} className={liked ? "fill-[var(--color-like)] stroke-[var(--color-like)]" : ""} />
          <span className="text-sm">{post.likes.length}</span>
        </button>
        <button
          type="button"
          onClick={e => {
            e.stopPropagation();
            startTransition(() => (onOpenCommentsSheet ?? onOpen)());
          }}
          className="flex items-center gap-1"
        >
          <MessageCircle size={22} />
          <span className="text-sm">{post.comments.length}</span>
        </button>
        <button type="button" onClick={() => { if (guestBlock()) return; startTransition(() => toggleRepost(post.id)); }} className={"flex items-center gap-1 " + (reposted ? "text-primary font-semibold" : "")}>
          <Repeat2 size={22} />
          <span className="text-sm">{post.reposts.length}</span>
        </button>
        <button type="button" onClick={() => { if (guestBlock()) return; onShare(post); }} className="flex items-center gap-1 ms-auto">
          <Send size={20} />
        </button>
        <button type="button" onClick={() => { if (guestBlock()) return; toggleFavorite(post.id); }} className={favorited ? "text-primary" : ""}><Bookmark size={20} className={favorited ? "fill-current" : ""} /></button>
      </div>

      {!hideQuickComment && (
        <form onSubmit={e => { e.preventDefault(); if (guestBlock()) return; if (comment.trim()) { addComment(post.id, comment); setComment(""); } }} className="flex gap-2 px-4 pt-2">
          <input value={comment} onChange={e => setComment(e.target.value)} placeholder="تعليق سريع..." className="flex-1 bg-input rounded-full px-4 py-2 text-sm outline-none" />
          {comment && <button type="submit" className="text-primary text-sm font-semibold">نشر</button>}
        </form>
      )}

      <NoteReplySheet
        note={noteToReply}
        contentLabelAr={postKindAr}
        onClose={() => setNoteToReply(null)}
        onSent={chatId => onOpenChat?.(chatId)}
      />
    </article>
  );
}
