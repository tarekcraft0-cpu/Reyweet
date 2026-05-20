import { useMemo, useState, startTransition } from "react";
import { MoreHorizontal, Play, AtSign } from "lucide-react";
import { Avatar } from "../Avatar";
import { VerifiedMarkForUser } from "../VerifiedBadge";
import { ShareSheet } from "../ShareSheet";
import type { Post, User } from "@/lib/types";
import { userDisplayName } from "@/lib/userDisplay";
import { formatRelativeTime } from "@/lib/formatRelativeTime";
import { normalizePostMedia, type NormalizedPostMedia } from "@/lib/postMedia";
import { renderMentionHashtagNodes } from "@/lib/renderMentionHashtagText";
import { useT } from "@/lib/i18n";

function TweetHeartIcon({ liked }: { liked: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
        stroke="currentColor"
        strokeWidth="1.75"
        fill={liked ? "var(--color-like, #ef4444)" : "none"}
        className={liked ? "stroke-[var(--color-like,#ef4444)]" : ""}
      />
    </svg>
  );
}

function TweetCommentIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M21 11.5a8.4 8.4 0 0 1-8.4 8.4c-1.2 0-2.35-.25-3.4-.7L3 21l1.8-6.2A8.38 8.38 0 0 1 3 11.5 8.4 8.4 0 0 1 11.4 3 8.4 8.4 0 0 1 21 11.5z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TweetRepostIcon({ reposted }: { reposted?: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden className={reposted ? "text-primary" : ""}>
      <path
        d="M17 1l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TweetShareIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ProfileTweetMedia({
  post,
  postMedia,
}: {
  post: Pick<Post, "image" | "video">;
  postMedia: NormalizedPostMedia;
}) {
  if (postMedia.hasImage && !postMedia.hasVideo) {
    return (
      <div className="mt-2.5 overflow-hidden rounded-2xl border border-border/50 bg-zinc-900/80">
        <img src={postMedia.imageUrl} alt="" className="max-h-[min(420px,55vh)] w-full object-cover" />
      </div>
    );
  }

  if (postMedia.hasVideo) {
    return (
      <div className="group relative mt-2.5 overflow-hidden rounded-2xl border border-border/50 bg-zinc-900">
        <video
          src={postMedia.videoUrl}
          poster={postMedia.posterUrl || undefined}
          controls
          playsInline
          preload="metadata"
          className="max-h-[min(420px,55vh)] w-full object-cover"
        />
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/20 group-has-[:is(video)]:hidden">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm">
            <Play size={28} fill="currentColor" className="ms-0.5" />
          </span>
        </span>
      </div>
    );
  }

  if (post.image && !post.video && postMedia.emojiFallback) {
    return (
      <div className="mt-2.5 flex min-h-[8rem] items-center justify-center rounded-2xl border border-border/50 bg-muted text-4xl">
        {postMedia.emojiFallback}
      </div>
    );
  }

  return null;
}

export function ProfileTweetCard({
  post,
  author,
  lang,
  liked,
  reposted,
  users,
  onOpenAuthor,
  onOpenProfile,
  onLike,
  onRepost,
  onAddComment,
  onMenu,
  showCommentsDefault = false,
  commentsAnchorId,
}: {
  post: Post;
  author: User;
  lang: string;
  liked: boolean;
  reposted: boolean;
  users: User[];
  onOpenAuthor: () => void;
  onOpenProfile: (userId: string) => void;
  onLike: () => void;
  onRepost: () => void;
  onAddComment: (text: string) => void;
  onMenu?: () => void;
  showCommentsDefault?: boolean;
  commentsAnchorId?: string;
}) {
  const t = useT();
  const [shareOpen, setShareOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(showCommentsDefault);
  const [comment, setComment] = useState("");
  const postMedia = useMemo(() => normalizePostMedia(post), [post.image, post.video, post.type]);
  const name = userDisplayName(author);
  const timeLabel = formatRelativeTime(post.createdAt, lang);

  const renderedPostText = useMemo(() => {
    if (!post.text) return null;
    return renderMentionHashtagNodes(post.text, {
      renderMention: (uname, key) => {
        const u = users.find(x => x.username === uname);
        if (u) {
          return (
            <button
              key={key}
              type="button"
              onClick={() => startTransition(() => onOpenProfile(u.id))}
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
  }, [post.text, users, onOpenProfile]);

  const actionBtn = "inline-flex items-center gap-1 rounded-md py-1 text-foreground/85 transition active:scale-95";
  const countCls = (active?: boolean, activeColor?: string) =>
    "text-[13px] tabular-nums " + (active && activeColor ? activeColor : "text-muted-foreground");

  return (
    <article dir="rtl" className="border-b border-border/80 px-3 py-3 text-right">
      <div className="flex flex-row gap-3">
        <button type="button" onClick={onOpenAuthor} className="h-10 w-10 shrink-0 self-start">
          <Avatar name={author.username} src={author.avatar} size={40} />
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-1">
            <button type="button" onClick={onOpenAuthor} className="min-w-0 flex-1 text-right">
              <div className="flex flex-wrap items-center justify-end gap-x-1 gap-y-0 leading-snug">
                <span className="font-bold text-[15px] text-foreground">{name}</span>
                <VerifiedMarkForUser user={author} size={15} />
                <span className="truncate text-[15px] text-muted-foreground">
                  @{author.username}
                  <span aria-hidden className="mx-0.5">
                    ·
                  </span>
                  <span className="tabular-nums">{timeLabel}</span>
                </span>
              </div>
            </button>
            {onMenu ? (
              <button
                type="button"
                onClick={onMenu}
                className="shrink-0 rounded-full p-1.5 text-muted-foreground hover:bg-secondary/80"
                aria-label="خيارات"
              >
                <MoreHorizontal size={18} strokeWidth={1.75} />
              </button>
            ) : null}
          </div>

          {renderedPostText && (
            <p className="mt-1 whitespace-pre-wrap text-right text-[15px] leading-relaxed text-foreground break-words">
              {renderedPostText}
            </p>
          )}

          <ProfileTweetMedia post={post} postMedia={postMedia} />

          <div dir="rtl" className="mt-2.5 flex w-full flex-row items-center justify-start gap-4 sm:gap-5">
              <button type="button" onClick={onLike} className={actionBtn} aria-pressed={liked}>
                <TweetHeartIcon liked={liked} />
                <span className={countCls(liked, "text-[var(--color-like,#ef4444)]")}>{post.likes.length}</span>
              </button>
              <button
                type="button"
                onClick={() => setCommentsOpen(o => !o)}
                className={actionBtn}
                aria-expanded={commentsOpen}
              >
                <TweetCommentIcon />
                <span className={countCls()}>{post.comments.length}</span>
              </button>
              <button type="button" onClick={onRepost} className={actionBtn} aria-pressed={reposted}>
                <TweetRepostIcon reposted={reposted} />
                <span className={countCls(reposted, "text-primary")}>{post.reposts.length}</span>
              </button>
            <button type="button" onClick={() => setShareOpen(true)} className={actionBtn} aria-label="مشاركة">
              <TweetShareIcon />
            </button>
          </div>

          {commentsOpen && (
            <div
              id={commentsAnchorId}
              className="mt-3 space-y-2 border-t border-border/60 pt-3 scroll-mt-24"
            >
              <h3 className="text-xs font-semibold text-muted-foreground">{t("comments")}</h3>
              {post.comments.map(c => {
                const u = users.find(x => x.id === c.userId);
                return (
                  <div key={c.id} className="flex gap-2 text-sm">
                    <button type="button" className="shrink-0" onClick={() => u && onOpenProfile(u.id)}>
                      <Avatar name={u?.username || "?"} src={u?.avatar} size={26} />
                    </button>
                    <div className="min-w-0">
                      <button type="button" className="font-semibold" onClick={() => u && onOpenProfile(u.id)}>
                        @{u?.username}
                      </button>{" "}
                      <span className="break-words">{c.text}</span>
                    </div>
                  </div>
                );
              })}
              {post.comments.length === 0 && <p className="text-xs text-muted-foreground">—</p>}
              <form
                onSubmit={e => {
                  e.preventDefault();
                  if (comment.trim()) {
                    onAddComment(comment.trim());
                    setComment("");
                  }
                }}
                className="flex gap-2 pt-1"
              >
                <input
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  placeholder={t("send")}
                  className="flex-1 rounded-full bg-input px-3 py-2 text-sm outline-none"
                />
                {comment.trim() && (
                  <button type="submit" className="shrink-0 text-sm font-semibold text-primary">
                    {t("send")}
                  </button>
                )}
              </form>
            </div>
          )}
        </div>
      </div>

      {shareOpen && <ShareSheet target={{ kind: "post", post }} onClose={() => setShareOpen(false)} />}
    </article>
  );
}
