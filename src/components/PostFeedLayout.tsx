import type { ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { Avatar } from "./Avatar";
import { ProgressiveImage } from "./ProgressiveImage";
import { VerifiedMarkForUser } from "./VerifiedBadge";
import type { Post } from "@/lib/types";
import type { User } from "@/lib/types";
import { userDisplayName } from "@/lib/userDisplay";
import { postShowsFeedMedia, type NormalizedPostMedia } from "@/lib/postMedia";
import { TweetVoicePlayer } from "./TweetVoicePlayer";
import { VideoPauseWhenHidden } from "./VideoPauseWhenHidden";

/** محاذاة عربية ثابتة — لا نستخدم dir=auto حتى لا يقلب الإطار حسب لغة النص */
export const FEED_POST_DIR = "rtl" as const;

/** صف البروفايل (X): اسم + توثيق + @يوزر · وقت | ⋯ يمين */
export function ProfilePostMetaRow({
  author,
  timeLabel,
  onOpenAuthor,
  onOpenPost,
  onMenu,
}: {
  author: User;
  timeLabel: string;
  onOpenAuthor: () => void;
  onOpenPost?: () => void;
  onMenu?: () => void;
}) {
  const name = userDisplayName(author);

  return (
    <div dir="ltr" className="flex min-w-0 items-center gap-1">
      <button
        type="button"
        onClick={onOpenPost ?? onOpenAuthor}
        className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden text-left"
      >
        <span className="shrink-0 font-bold text-[15px] leading-tight text-foreground">{name}</span>
        <VerifiedMarkForUser user={author} size={15} />
        <span className="min-w-0 truncate text-[15px] text-muted-foreground">
          @{author.username}
          <span aria-hidden className="mx-0.5">
            ·
          </span>
          <span className="tabular-nums">{timeLabel}</span>
        </span>
      </button>
      {onMenu ? (
        <button
          type="button"
          onClick={e => {
            e.stopPropagation();
            onMenu();
          }}
          className="shrink-0 rounded-full p-1.5 text-muted-foreground hover:bg-secondary/80 active:scale-95"
          aria-label="خيارات المنشور"
        >
          <MoreHorizontal size={18} strokeWidth={1.75} />
        </button>
      ) : null}
    </div>
  );
}

/** رأس منشور احترافي: أفتار + اسم + @يوزر + وقت | قائمة خيارات */
export function PostFeedHeader({
  author,
  timeLabel,
  onOpenAuthor,
  onOpenPost,
  onMenu,
  avatarOnLeft = false,
  hideAvatar = false,
}: {
  author: User;
  timeLabel: string;
  onOpenAuthor: () => void;
  onOpenPost?: () => void;
  onMenu?: () => void;
  /** بروفايل: الأفتار يسار والنص يمينه (مثل X) */
  avatarOnLeft?: boolean;
  /** عند وضع الأفتار في عمود خارجي (بروفايل) */
  hideAvatar?: boolean;
}) {
  const name = userDisplayName(author);

  if (avatarOnLeft || hideAvatar) {
    return (
      <header dir="ltr" className={"flex flex-row items-start gap-3 " + (hideAvatar ? "" : "px-4 py-3")}>
        {!hideAvatar ? (
          <button type="button" onClick={onOpenAuthor} className="h-10 w-10 shrink-0">
            <Avatar name={author.username} src={author.avatar} size={40} />
          </button>
        ) : null}
        <div className="min-w-0 flex-1 pt-0.5">
          <ProfilePostMetaRow
            author={author}
            timeLabel={timeLabel}
            onOpenAuthor={onOpenAuthor}
            onOpenPost={onOpenPost}
            onMenu={onMenu}
          />
        </div>
      </header>
    );
  }

  return (
    <header dir={FEED_POST_DIR} className="flex flex-row items-center gap-3 px-4 py-3 text-right">
      <button type="button" onClick={onOpenAuthor} className="shrink-0">
        <Avatar name={author.username} src={author.avatar} size={40} />
      </button>
      <button type="button" onClick={onOpenPost ?? onOpenAuthor} className="min-w-0 flex-1 text-right">
        <div className="flex flex-wrap items-center justify-end gap-x-1.5 gap-y-0.5">
          <span className="font-bold text-[15px] leading-tight text-foreground">{name}</span>
          <VerifiedMarkForUser user={author} size={16} />
        </div>
        <div className="mt-0.5 flex flex-wrap items-center justify-end gap-x-1.5 text-xs text-muted-foreground">
          <span>@{author.username}</span>
          <span aria-hidden>·</span>
          <span className="tabular-nums">{timeLabel}</span>
        </div>
      </button>
      {onMenu ? (
        <button
          type="button"
          onClick={e => {
            e.stopPropagation();
            onMenu();
          }}
          className="shrink-0 rounded-full p-2 text-muted-foreground hover:bg-secondary/80 active:scale-95"
          aria-label="خيارات المنشور"
        >
          <MoreHorizontal size={20} strokeWidth={1.75} />
        </button>
      ) : null}
    </header>
  );
}

export function PostFeedCaption({
  children,
  onClick,
  variant = "post",
  profileInset = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "post" | "tweet" | "reel";
  profileInset?: boolean;
}) {
  if (!children) return null;
  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? e => e.key === "Enter" && onClick() : undefined}
      dir={FEED_POST_DIR}
      className={
        "whitespace-pre-wrap text-right break-words " +
        (profileInset ? "px-0 pb-2 pt-0.5" : "px-4 ") +
        (variant === "tweet"
          ? "pb-2 pt-0.5 text-[16px] leading-relaxed text-foreground"
          : "pb-3 text-[15px] leading-relaxed text-foreground") +
        (onClick ? " cursor-pointer" : "")
      }
    >
      {children}
    </div>
  );
}

export function PostFeedMedia({
  children,
  aspect = "square",
  onClick,
  profileInset = false,
}: {
  children: ReactNode;
  aspect?: "square" | "video";
  onClick?: () => void;
  profileInset?: boolean;
}) {
  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? e => e.key === "Enter" && onClick() : undefined}
      className={
        "relative cursor-pointer overflow-hidden rounded-2xl bg-muted " +
        (profileInset ? "mx-0" : "mx-4 ") +
        (aspect === "video" ? "aspect-video" : "aspect-square")
      }
    >
      {children}
    </div>
  );
}

/** وسائط البطاقة: منشور/ريلز فقط — التغريدة بدون مساحة صورة */
export function PostFeedMediaBlock({
  post,
  postMedia,
  notesOverlay,
  onOpen,
  profileInset = false,
}: {
  post: Pick<Post, "type" | "image" | "video" | "audio" | "text">;
  postMedia: NormalizedPostMedia;
  notesOverlay?: ReactNode;
  onOpen?: () => void;
  profileInset?: boolean;
}) {
  if (!postShowsFeedMedia(post)) return null;

  if (postMedia.hasImage) {
    return (
      <PostFeedMedia aspect={post.type === "reel" ? "video" : "square"} onClick={onOpen} profileInset={profileInset}>
        {notesOverlay}
        <ProgressiveImage
          src={postMedia.imageUrl!}
          alt=""
          className="h-full w-full"
        />
      </PostFeedMedia>
    );
  }

  if (postMedia.hasAudio && postMedia.audioUrl) {
    return (
      <div className={(profileInset ? "mx-0 w-full shrink-0" : "mx-4 w-[calc(100%-2rem)] shrink-0") + " mb-1"}>
        <TweetVoicePlayer src={postMedia.audioUrl} />
      </div>
    );
  }

  if (postMedia.hasVideo) {
    const reelGrid = post.type === "reel";
    return (
      <VideoPauseWhenHidden>
        <PostFeedMedia aspect={reelGrid ? "square" : "video"} onClick={onOpen} profileInset={profileInset}>
          {notesOverlay}
          <video
            src={postMedia.videoUrl}
            poster={postMedia.posterUrl || undefined}
            controls
            playsInline
            preload="none"
            className={
              "h-full w-full " +
              (reelGrid ? "object-cover object-center" : "object-cover")
            }
            onClick={e => e.stopPropagation()}
          />
        </PostFeedMedia>
      </VideoPauseWhenHidden>
    );
  }

  if (post.image && !post.video) {
    return (
      <PostFeedMedia onClick={onOpen} profileInset={profileInset}>
        <div className="flex h-full min-h-[8rem] items-center justify-center text-5xl">
          {postMedia.emojiFallback || post.image}
        </div>
      </PostFeedMedia>
    );
  }

  if (!post.text && post.type === "post") {
    return (
      <button
        type="button"
        onClick={onOpen}
        className={
          (profileInset ? "mx-0 w-full" : "mx-4 w-[calc(100%-2rem)]") +
          " mb-1 flex min-h-[100px] cursor-pointer items-center justify-center rounded-2xl border border-border/60 bg-muted/50 text-xs text-muted-foreground hover:bg-muted/70 active:scale-[0.99]"
        }
      >
        اضغط للمنشور كامل
      </button>
    );
  }

  return null;
}

export function PostFeedActions({
  liked,
  reposted,
  likeCount,
  commentCount,
  repostCount,
  onLike,
  onComment,
  onRepost,
  onShare,
  profileInset = false,
}: {
  liked: boolean;
  reposted: boolean;
  likeCount: number;
  commentCount: number;
  repostCount: number;
  onLike: () => void;
  onComment: () => void;
  onRepost: () => void;
  onShare: () => void;
  /** داخل عمود بجانب الأفتار (بدون padding جانبي إضافي) */
  profileInset?: boolean;
}) {
  const btn =
    "inline-flex items-center gap-1 rounded-md py-1 text-foreground/85 transition active:scale-95";
  const countBase = "text-[13px] tabular-nums";
  const likeCountCls = countBase + (liked ? " text-[var(--color-like,#ef4444)]" : " text-muted-foreground");
  const commentCountCls = countBase + " text-muted-foreground";
  const repostCountCls = countBase + (reposted ? " text-primary" : " text-muted-foreground");

  return (
    <div
      dir="ltr"
      className={
        "flex flex-row items-center justify-between gap-2" + (profileInset ? " px-0 py-2.5" : " px-3 py-2.5")
      }
    >
      <div className="flex flex-row items-center gap-4 sm:gap-5">
        <button type="button" onClick={onLike} className={btn} aria-pressed={liked}>
          <HeartIcon liked={liked} size={20} />
          <span className={likeCountCls}>{likeCount}</span>
        </button>
        <button type="button" onClick={onComment} className={btn}>
          <CommentIcon size={20} />
          <span className={commentCountCls}>{commentCount}</span>
        </button>
        <button
          type="button"
          onClick={onRepost}
          className={btn + (reposted ? " text-primary" : "")}
          aria-pressed={reposted}
        >
          <RepostIcon reposted={reposted} size={20} />
          <span className={repostCountCls}>{repostCount}</span>
        </button>
      </div>
      <button type="button" onClick={onShare} className={btn} aria-label="مشاركة">
        <ShareIcon size={19} />
      </button>
    </div>
  );
}

/** غلاف موحّد: أفتار يسار + عمود المحتوى (رئيسية / بروفايل / بحث) */
export function FeedPostColumnShell({
  author,
  onOpenAuthor,
  children,
  className = "",
}: {
  author: User;
  onOpenAuthor: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={"relative px-3 py-3 " + className} dir="ltr">
      <div className="flex gap-3">
        <button type="button" onClick={onOpenAuthor} className="h-10 w-10 shrink-0 self-start">
          <Avatar name={author.username} src={author.avatar} size={40} />
        </button>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}

function HeartIcon({ liked, size = 24 }: { liked: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
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

function CommentIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M21 11.5a8.4 8.4 0 0 1-8.4 8.4c-1.2 0-2.35-.25-3.4-.7L3 21l1.8-6.2A8.38 8.38 0 0 1 3 11.5 8.4 8.4 0 0 1 11.4 3 8.4 8.4 0 0 1 21 11.5z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function RepostIcon({ reposted, size = 24 }: { reposted?: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden className={reposted ? "text-primary" : ""}>
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

function ShareIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
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
