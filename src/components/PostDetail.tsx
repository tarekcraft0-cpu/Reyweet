import { useEffect, useState, startTransition, useMemo, useCallback } from "react";
import { useApp, userById, visibleMediaNotes, isMutual } from "@/lib/store";
import { notifyGuestActionBlocked } from "@/lib/guestBlocked";
import { formatRelativeTime } from "@/lib/formatRelativeTime";
import { useT } from "@/lib/i18n";
import { Avatar } from "./Avatar";
import { ShareSheet } from "./ShareSheet";
import { Heart, MessageCircle, Repeat2, Send, ArrowRight, AtSign } from "lucide-react";
import { VerifiedMarkForUser } from "./VerifiedBadge";
import type { MediaNote, Post, ProfileHomeSurface, ProfileReturnContext } from "@/lib/types";
import { NoteReplySheet } from "./NoteReplySheet";
import { isRenderableMediaUrl } from "@/lib/mediaUrl";
import { renderMentionHashtagNodes } from "@/lib/renderMentionHashtagText";

interface Props {
  post: Post;
  onBack: () => void;
  onOpenProfile: (id: string, ctx?: ProfileReturnContext) => void;
  onOpenChat: (chatId: string) => void;
  profileReturnTab: ProfileReturnContext["tab"];
  /** بعد الرجوع من بروفايل من التعليقات */
  initialFocusComments?: boolean;
}

export function PostDetail({ post, onBack, onOpenProfile, onOpenChat, profileReturnTab, initialFocusComments }: Props) {
  const { state, currentUser, toggleLike, toggleRepost, addComment, isGuest } = useApp();
  const [noteToReply, setNoteToReply] = useState<MediaNote | null>(null);
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
        profileReturnTab === "home" ? "post_detail_full" : undefined;
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
    if (!initialFocusComments) return;
    const t = window.setTimeout(() => {
      document.getElementById("post-comments-anchor")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
    return () => window.clearTimeout(t);
  }, [initialFocusComments]);

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
  }, [post.text, state.users, onOpenProfile, returnCtx]);

  if (!author) return null;

  return (
    <div dir="auto" className="pb-4">
      <div className="flex items-center gap-3 p-3 border-b border-border sticky top-0 bg-background z-10">
        <button type="button" onClick={onBack} className="shrink-0 p-1 rounded-full hover:bg-secondary"><ArrowRight /></button>
        <button type="button" onClick={() => startTransition(() => onOpenProfile(author.id, returnCtx(false)))} className="shrink-0">
          <Avatar name={author.username} src={author.avatar} size={36} />
        </button>
        <div className="flex flex-col items-start">
          <button type="button" onClick={() => startTransition(() => onOpenProfile(author.id, returnCtx(false)))} className="font-semibold text-sm inline-flex items-center gap-1">
            @{author.username}
            <VerifiedMarkForUser user={author} size={16} />
          </button>
          <span className="text-xs text-muted-foreground">{formatRelativeTime(post.createdAt, lang)}</span>
        </div>
      </div>

      {detailNotes.length > 0 && (
        <div className="px-4 pb-2 flex gap-2 overflow-x-auto no-scrollbar">
          {detailNotes.map(n => {
            const nu = userById(state, n.authorId)!;
            const canReplyNote = n.authorId !== me.id;
            return (
              <div key={n.id} className="flex flex-col items-center shrink-0 max-w-[4rem]">
                {canReplyNote ? (
                  <button
                    type="button"
                    title="رد في الخاص"
                    onClick={() => {
                      if (guestBlock()) return;
                      setNoteToReply(n);
                    }}
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

      {post.text && (
        <p dir="auto" className="whitespace-pre-wrap px-4 py-3 text-start text-base leading-relaxed break-words">
          {renderedPostText}
        </p>
      )}
      {post.image && (
        <div className="flex items-center justify-center bg-muted">
          {isRenderableMediaUrl(post.image) ? (
            <img src={post.image} className="max-h-[70vh] w-full object-contain" alt="" />
          ) : (
            <div className="flex min-h-[10rem] items-center justify-center py-12 text-5xl">{post.image}</div>
          )}
        </div>
      )}
      {post.video && (
        <div className="flex items-center justify-center bg-black">
          {isRenderableMediaUrl(post.video) ? (
            <video src={post.video} controls playsInline className="max-h-[70vh] w-full object-contain" />
          ) : (
            <div className="flex min-h-[10rem] items-center justify-center py-12 text-5xl text-white">{post.video}</div>
          )}
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

      <div className="px-4 pt-3 space-y-2 border-t border-border mt-3">
        <h3 id="post-comments-anchor" className="font-semibold text-sm pt-2 scroll-mt-20">{t("comments")}</h3>
        {post.comments.map(c => {
          const u = userById(state, c.userId);
          return (
            <div key={c.id} className="text-sm flex gap-2">
              <button type="button" className="shrink-0 rounded-full" onClick={() => startTransition(() => u && onOpenProfile(u.id, returnCtx(true)))}>
                <Avatar name={u?.username || "?"} src={u?.avatar} size={28} />
              </button>
              <div>
                <button type="button" className="font-semibold" onClick={() => startTransition(() => u && onOpenProfile(u.id, returnCtx(true)))}>
                  @{u?.username}
                </button>{" "}
                <span dir="auto" className="break-words">
                  {c.text}
                </span>
              </div>
            </div>
          );
        })}
        {post.comments.length === 0 && <p className="text-xs text-muted-foreground">—</p>}
        <form onSubmit={e => { e.preventDefault(); if (guestBlock()) return; if (comment.trim()) { addComment(post.id, comment); setComment(""); } }} className="flex gap-2 pt-2 sticky bottom-0 bg-background py-2">
          <input value={comment} onChange={e => setComment(e.target.value)} placeholder={t("send")} className="flex-1 bg-input rounded-full px-4 py-2 text-sm outline-none" />
          <button type="submit" className="text-primary text-sm font-semibold">{t("send")}</button>
        </form>
      </div>

      {shareOpen && <ShareSheet target={{ kind: "post", post }} onClose={() => setShareOpen(false)} />}

      <NoteReplySheet
        note={noteToReply}
        contentLabelAr={postKindAr}
        onClose={() => setNoteToReply(null)}
        onSent={onOpenChat}
      />
    </div>
  );
}
