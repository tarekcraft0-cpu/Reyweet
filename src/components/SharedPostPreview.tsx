import { useApp, userById } from "@/lib/store";
import { Avatar } from "./Avatar";
import { VerifiedMarkForUser } from "./VerifiedBadge";
import { Heart, MessageCircle, Repeat2, Film } from "lucide-react";
import { isRenderableMediaUrl } from "@/lib/mediaUrl";
import { normalizeStoryMedia } from "@/lib/storyMedia";
import { userDisplayName } from "@/lib/userDisplay";

interface Props {
  postId: string;
  comment?: string;
  compact?: boolean;
  /** بطاقة ضيقة للشات — بلا حواف */
  variant?: "default" | "chat";
}

export function SharedPostPreview({ postId, comment, compact = false, variant = "default" }: Props) {
  const { state, currentUser } = useApp();
  const post = state.posts.find(p => p.id === postId);
  const author = post ? userById(state, post.userId) : null;

  if (!post || !author) {
    return (
      <div className="rounded-2xl bg-muted/40 p-3 dark:bg-zinc-900/60">
        <div className="text-center text-xs text-muted-foreground">منشور غير متوفر</div>
      </div>
    );
  }

  const liked = currentUser ? post.likes.includes(currentUser.id) : false;
  const reposted = currentUser ? post.reposts.includes(currentUser.id) : false;

  if (variant === "chat") {
    const caption =
      [post.text?.trim()].filter(Boolean).join(" ") ||
      (post.image && !isRenderableMediaUrl(post.image) ? post.image : "") ||
      "…";
    const img = post.image?.trim();
    const hasImg = !!(img && (img.startsWith("data:") || img.startsWith("http")));
    const emojiOnly = img && !hasImg && img.length <= 6;
    /** ارتفاع وسيط يملأ العرض حتى لا يظهر شريط أسود جانبي مع object-cover */
    const mediaFrame = "relative w-full overflow-hidden rounded-none bg-transparent";

    return (
      <div className="w-full max-w-[min(96vw,360px)] overflow-hidden rounded-none border-0 bg-transparent shadow-none ring-0">
        <div className="flex items-center gap-2 px-1 py-1.5">
          <Avatar name={author.username} src={author.avatar} size={22} />
          <div className="min-w-0 flex-1 text-start">
            <div className="flex items-center gap-1 truncate">
              <span className="truncate text-xs font-semibold">{userDisplayName(author)}</span>
              <VerifiedMarkForUser user={author} size={12} />
            </div>
            <div className="text-[10px] text-muted-foreground">
              {post.type === "tweet" ? "تغريدة" : post.type === "reel" ? "ريلز" : "منشور"}
            </div>
          </div>
        </div>
        {comment && <p className="px-1 pb-1.5 text-[11px] italic text-muted-foreground">&quot;{comment}&quot;</p>}
        <div className="space-y-2 px-0 pb-1">
          {hasImg && (
            <div className={mediaFrame}>
              <img
                src={img}
                alt=""
                className="block max-h-[min(52vh,400px)] min-h-[220px] w-full object-cover object-center"
              />
            </div>
          )}
          {emojiOnly && !post.video && (
            <div className="flex min-h-[5rem] items-center justify-center rounded-none bg-transparent text-5xl">{img}</div>
          )}
          {post.video && isRenderableMediaUrl(post.video) && (
            <div className={mediaFrame}>
              <video
                src={post.video}
                controls
                className="block max-h-[min(52vh,400px)] min-h-[220px] w-full object-cover object-center"
                playsInline
                preload="metadata"
              />
            </div>
          )}
          <p className="line-clamp-2 px-0.5 text-start text-[11px] leading-snug text-foreground/90">
            <span className="font-semibold">@{author.username}</span> {caption}
          </p>
          <div className="flex items-center gap-3 pt-1 text-[10px] text-muted-foreground">
            <span className="inline-flex items-center gap-0.5">
              <Heart size={12} className={liked ? "fill-red-500 text-red-500" : ""} />
              {post.likes.length}
            </span>
            <span className="inline-flex items-center gap-0.5">
              <MessageCircle size={12} />
              {post.comments.length}
            </span>
            <span className="inline-flex items-center gap-0.5">
              <Repeat2 size={12} className={reposted ? "text-emerald-500" : ""} />
              {post.reposts.length}
            </span>
            {post.type === "reel" && <Film size={12} className="ms-auto opacity-70" />}
          </div>
        </div>
      </div>
    );
  }

  if (compact) {
    return (
      <div className="rounded-xl bg-muted/40 p-3 dark:bg-zinc-900/60">
        <div className="mb-2 flex items-center gap-2">
          <Avatar name={author.username} src={author.avatar} size={20} />
          <span className="text-xs font-medium">@{author.username}</span>
          <span className="text-xs text-muted-foreground">• منشور</span>
        </div>
        {post.text && <p className="mb-2 line-clamp-2 text-sm">{post.text}</p>}
        {post.image && (
          <div className="mb-2 aspect-video overflow-hidden rounded-lg bg-muted/50">
            {isRenderableMediaUrl(post.image) ? (
              <img src={post.image} className="h-full w-full object-cover" alt="" />
            ) : (
              <div className="flex h-full items-center justify-center text-3xl">{post.image}</div>
            )}
          </div>
        )}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>❤️ {post.likes.length}</span>
          <span>💬 {post.comments.length}</span>
          <span>🔄 {post.reposts.length}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl bg-muted/30 dark:bg-zinc-900/70">
      <div className="flex items-center gap-2 p-3">
        <Avatar name={author.username} src={author.avatar} size={24} />
        <div className="flex-1">
          <div className="flex items-center gap-1">
            <span className="text-sm font-medium">@{author.username}</span>
            <VerifiedMarkForUser user={author} size={12} />
          </div>
          <div className="text-xs text-muted-foreground">{post.type === "tweet" ? "تغريدة" : post.type === "reel" ? "ريلز" : "منشور"}</div>
        </div>
      </div>

      <div className="space-y-3 p-3 pt-0">
        {comment && <div className="text-sm italic text-muted-foreground">&quot;{comment}&quot;</div>}

        {post.text && <p className="whitespace-pre-wrap text-sm">{post.text}</p>}

        {post.image && (
          <div className="aspect-square overflow-hidden rounded-lg bg-muted/40 dark:bg-zinc-800/50">
            {isRenderableMediaUrl(post.image) ? (
              <img src={post.image} className="h-full w-full object-cover" alt="" />
            ) : (
              <div className="flex h-full items-center justify-center text-5xl">{post.image}</div>
            )}
          </div>
        )}

        {post.video && isRenderableMediaUrl(post.video) && (
          <div className="overflow-hidden rounded-lg bg-muted/50 dark:bg-zinc-800/60">
            <video src={post.video} controls className="w-full" playsInline preload="metadata" />
          </div>
        )}

        <div className="flex items-center justify-between pt-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1">
              <Heart size={14} className={liked ? "fill-current text-red-500" : ""} />
              <span>{post.likes.length}</span>
            </div>
            <div className="flex items-center gap-1">
              <MessageCircle size={14} />
              <span>{post.comments.length}</span>
            </div>
            <div className="flex items-center gap-1">
              <Repeat2 size={14} className={reposted ? "text-emerald-500" : ""} />
              <span>{post.reposts.length}</span>
            </div>
          </div>
          {post.type === "reel" && <Film size={14} />}
        </div>
      </div>
    </div>
  );
}

/** بطاقة ستوري مضغوطة للشات — بلا حواف */
export function SharedStoryChatPreview({ storyId, comment }: { storyId: string; comment?: string }) {
  const { state } = useApp();
  const story = state.stories.find(s => s.id === storyId);
  const author = story ? userById(state, story.userId) : null;

  if (!story || !author) {
    return (
      <div className="rounded-2xl bg-muted/40 p-3 dark:bg-zinc-900/60">
        <div className="text-center text-xs text-muted-foreground">ستوري غير متوفر</div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[min(96vw,360px)] overflow-hidden rounded-none border-0 bg-transparent shadow-none ring-0">
      <div className="flex items-center gap-2 px-1 py-1.5">
        <Avatar name={author.username} src={author.avatar} size={22} />
        <div className="min-w-0 flex-1 text-start">
          <div className="flex items-center gap-1 truncate">
            <span className="truncate text-xs font-semibold">@{author.username}</span>
            <VerifiedMarkForUser user={author} size={12} />
          </div>
          <div className="text-[10px] text-muted-foreground">ستوري</div>
        </div>
      </div>
      {comment && <p className="px-1 pb-1.5 text-[11px] italic text-muted-foreground">&quot;{comment}&quot;</p>}
      <div className="px-0 pb-1">
        <div className="relative w-full overflow-hidden rounded-none bg-transparent">
          {(() => {
            const sm = normalizeStoryMedia(story);
            if (sm.hasVideo) {
              return (
                <video
                  src={sm.videoUrl}
                  className="block max-h-[min(52vh,400px)] min-h-[220px] w-full object-cover object-center"
                  muted
                  playsInline
                  preload="metadata"
                />
              );
            }
            if (sm.hasImage) {
              return (
                <img
                  src={sm.imageUrl}
                  alt=""
                  className="block max-h-[min(52vh,400px)] min-h-[220px] w-full object-cover object-center"
                />
              );
            }
            return (
              <div className="flex min-h-[220px] items-center justify-center text-5xl">
                {sm.emojiFallback || "📷"}
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
