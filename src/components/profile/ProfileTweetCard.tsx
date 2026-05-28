import { useMemo, useState, startTransition } from "react";
import { Play, AtSign, Trash2 } from "lucide-react";
import { Avatar } from "../Avatar";
import { ShareSheet } from "../ShareSheet";
import { FeedPostColumnShell, ProfilePostMetaRow } from "../PostFeedLayout";
import { TweetVoicePlayer } from "../TweetVoicePlayer";
import type { Post, User } from "@/lib/types";
import { formatRelativeTime } from "@/lib/formatRelativeTime";
import { normalizePostMedia, type NormalizedPostMedia } from "@/lib/postMedia";
import { renderMentionHashtagNodes, createMentionRenderer } from "@/lib/renderMentionHashtagText";
import { useT } from "@/lib/i18n";
import { useApp } from "@/lib/store";

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
  post: Pick<Post, "image" | "video" | "audio">;
  postMedia: NormalizedPostMedia;
}) {
  if (postMedia.hasImage && !postMedia.hasVideo) {
    return (
      <div className="mt-2.5 overflow-hidden rounded-2xl border border-border/50 bg-zinc-900/80">
        <img src={postMedia.imageUrl} alt="" className="max-h-[min(420px,55vh)] w-full object-cover" />
      </div>
    );
  }

  if (postMedia.hasAudio && post.audio) {
    return (
      <div className="mt-2.5 rounded-2xl border border-border/50 bg-card p-3">
        <TweetVoicePlayer src={post.audio} />
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
  const { state, currentUser, deleteComment } = useApp();
  const livePost = useMemo(
    () => state.posts.find(p => p.id === post.id) ?? post,
    [state.posts, post],
  );
  const safeLikes = Array.isArray(livePost.likes) ? livePost.likes : [];
  const safeReposts = Array.isArray(livePost.reposts) ? livePost.reposts : [];
  const safeComments = (Array.isArray(livePost.comments) ? livePost.comments : [])
    .filter(
      (c): c is { id: string; userId: string; text: string; createdAt: number } =>
        !!c &&
        typeof c === "object" &&
        typeof (c as { id?: unknown }).id === "string" &&
        typeof (c as { userId?: unknown }).userId === "string" &&
        typeof (c as { text?: unknown }).text === "string",
    )
    .map(c => ({
      id: c.id,
      userId: c.userId,
      text: c.text,
      createdAt: typeof c.createdAt === "number" ? c.createdAt : Date.now(),
    }));
  const me = currentUser!;
  const [shareOpen, setShareOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(showCommentsDefault);
  const [comment, setComment] = useState("");
  const postMedia = useMemo(() => normalizePostMedia(livePost), [livePost.image, livePost.video, livePost.type]);
  const timeLabel = formatRelativeTime(livePost.createdAt, lang);

  const renderedPostText = useMemo(() => {
    if (!livePost.text) return null;
    return renderMentionHashtagNodes(livePost.text, {
      renderMention: createMentionRenderer({
        users,
        onUserClick: userId => startTransition(() => onOpenProfile(userId)),
      }),
      renderHashtag: (h, key) => (
        <span key={key} className="text-primary">
          {h}
        </span>
      ),
    });
  }, [livePost.text, users, onOpenProfile]);

  const actionBtn = "inline-flex items-center gap-1 rounded-md py-1 text-foreground/85 transition active:scale-95";
  const countCls = (active?: boolean, activeColor?: string) =>
    "text-[13px] tabular-nums " + (active && activeColor ? activeColor : "text-muted-foreground");

  return (
    <article className="border-b border-border/80">
      <FeedPostColumnShell author={author} onOpenAuthor={onOpenAuthor}>
          <ProfilePostMetaRow
            author={author}
            timeLabel={timeLabel}
            onOpenAuthor={onOpenAuthor}
            onMenu={onMenu}
          />

          {renderedPostText && (
            <p
              dir="rtl"
              className="mt-1 whitespace-pre-wrap text-right text-[15px] leading-relaxed text-foreground break-words"
            >
              {renderedPostText}
            </p>
          )}

          <ProfileTweetMedia post={livePost} postMedia={postMedia} />

          <div dir="ltr" className="mt-2.5 flex w-full items-center justify-between gap-2">
            <div className="flex items-center gap-4 sm:gap-5">
              <button type="button" onClick={onLike} className={actionBtn} aria-pressed={liked}>
                <TweetHeartIcon liked={liked} />
                <span className={countCls(liked, "text-[var(--color-like,#ef4444)]")}>{safeLikes.length}</span>
              </button>
              <button
                type="button"
                onClick={() => setCommentsOpen(o => !o)}
                className={actionBtn}
                aria-expanded={commentsOpen}
              >
                <TweetCommentIcon />
                <span className={countCls()}>{safeComments.length}</span>
              </button>
              <button type="button" onClick={onRepost} className={actionBtn} aria-pressed={reposted}>
                <TweetRepostIcon reposted={reposted} />
                <span className={countCls(reposted, "text-primary")}>{safeReposts.length}</span>
              </button>
            </div>
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
              {safeComments.map(c => {
                const u = users.find(x => x.id === c.userId);
                return (
                  <div key={c.id} className="flex gap-2 text-sm" dir="ltr">
                    <button type="button" className="shrink-0" onClick={() => u && onOpenProfile(u.id)}>
                      <Avatar name={u?.username || "?"} src={u?.avatar} size={26} />
                    </button>
                    <div className="min-w-0 flex-1" dir="rtl">
                      <button type="button" className="font-semibold" onClick={() => u && onOpenProfile(u.id)}>
                        @{u?.username}
                      </button>{" "}
                      <span className="break-words">{c.text}</span>
                    </div>
                    {c.userId === me.id && (
                      <button
                        type="button"
                        onClick={() => {
                          if (!window.confirm("حذف هذا التعليق؟")) return;
                          deleteComment(livePost.id, c.id);
                        }}
                        className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        aria-label="حذف التعليق"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                );
              })}
              {safeComments.length === 0 && <p className="text-xs text-muted-foreground">—</p>}
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
      </FeedPostColumnShell>

      {shareOpen && <ShareSheet target={{ kind: "post", post: livePost }} onClose={() => setShareOpen(false)} />}
    </article>
  );
}
