import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useApp, userById } from "@/lib/store";
import { Avatar } from "../Avatar";
import { VerifiedMarkForUser } from "../VerifiedBadge";
import { Heart, MessageCircle, Repeat2, Film, X } from "lucide-react";
import { isRenderableMediaUrl, resolveMediaUrl } from "@/lib/mediaUrl";
import { normalizeStoryMedia } from "@/lib/storyMedia";

export type ChatShareFeedItem = {
  messageId: string;
  kind: "post" | "story";
  targetId: string;
  shareText?: string;
};

function ShareFeedPostSection({ postId }: { postId: string }) {
  const { state, currentUser } = useApp();
  const post = state.posts.find(p => p.id === postId);
  const author = post ? userById(state, post.userId) : null;
  const liked = currentUser && post ? post.likes.includes(currentUser.id) : false;
  const reposted = currentUser && post ? post.reposts.includes(currentUser.id) : false;

  if (!post || !author) {
    return <p className="px-4 py-8 text-center text-sm text-muted-foreground">منشور غير متوفر</p>;
  }

  const caption = [post.text?.trim()].filter(Boolean).join(" ") || "";
  const img = post.image?.trim();
  const hasImg = isRenderableMediaUrl(img);
  const emojiOnly = !!(img && !hasImg && img.length <= 6);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <div className="flex items-center gap-3 px-4 pt-4">
        <Avatar name={author.username} src={author.avatar} size={44} />
        <div className="min-w-0 flex-1 text-start">
          <div className="flex items-center gap-1 truncate text-base font-semibold">
            @{author.username}
            <VerifiedMarkForUser user={author} size={16} />
          </div>
          <div className="text-xs text-muted-foreground">
            {post.type === "tweet" ? "تغريدة" : post.type === "reel" ? "ريلز" : "منشور"}
          </div>
        </div>
      </div>
      {caption && (
        <p dir="auto" className="mt-3 whitespace-pre-wrap px-4 text-start text-sm leading-relaxed [overflow-wrap:anywhere]">
          {caption}
        </p>
      )}
      {hasImg && (
        <div className="mt-3 flex w-full justify-center bg-muted/20 px-2">
          <img src={resolveMediaUrl(img!)} alt="" className="max-h-[min(58vh,520px)] w-full max-w-lg object-contain" />
        </div>
      )}
      {emojiOnly && !post.video && (
        <div className="mt-3 flex min-h-[12rem] items-center justify-center bg-muted/20 text-5xl">{img}</div>
      )}
      {post.video && isRenderableMediaUrl(post.video) && (
        <div className="mt-3 flex w-full justify-center bg-muted/30 px-2">
          <video src={resolveMediaUrl(post.video)} controls className="max-h-[min(58vh,520px)] w-full max-w-lg object-contain" playsInline preload="metadata" />
        </div>
      )}
      <div className="mt-4 flex items-center gap-6 px-4 text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Heart size={18} className={liked ? "fill-red-500 text-red-500" : ""} />
          {post.likes.length}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <MessageCircle size={18} />
          {post.comments.length}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Repeat2 size={18} className={reposted ? "text-emerald-500" : ""} />
          {post.reposts.length}
        </span>
        {post.type === "reel" && <Film size={18} className="ms-auto opacity-70" />}
      </div>
    </div>
  );
}

function ShareFeedStorySection({ storyId }: { storyId: string }) {
  const { state } = useApp();
  const story = state.stories.find(s => s.id === storyId);
  const author = story ? userById(state, story.userId) : null;

  if (!story || !author) {
    return <p className="px-4 py-8 text-center text-sm text-muted-foreground">ستوري غير متوفر</p>;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <div className="flex items-center gap-3 px-4 pt-4">
        <Avatar name={author.username} src={author.avatar} size={44} />
        <div className="min-w-0 flex-1 text-start">
          <div className="flex items-center gap-1 truncate text-base font-semibold">
            @{author.username}
            <VerifiedMarkForUser user={author} size={16} />
          </div>
          <div className="text-xs text-muted-foreground">ستوري</div>
        </div>
      </div>
      <div className="mt-4 flex min-h-0 flex-1 items-center justify-center bg-muted/20 px-2 pb-8">
        {(() => {
          const sm = normalizeStoryMedia(story);
          if (sm.hasVideo) {
            return (
              <video
                src={sm.videoUrl}
                controls
                className="max-h-[min(62vh,560px)] w-full max-w-lg object-contain"
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
                className="max-h-[min(62vh,560px)] w-full max-w-lg object-contain"
              />
            );
          }
          return <span className="text-6xl">{sm.emojiFallback || "📷"}</span>;
        })()}
      </div>
    </div>
  );
}

export function ChatSharedFeedOverlay({
  items,
  initialIndex,
  onClose,
}: {
  items: ChatShareFeedItem[];
  initialIndex: number;
  onClose: () => void;
}) {
  const scrollKeyRef = useRef("");
  const key = useMemo(() => items.map(i => i.messageId).join("|") + "#" + initialIndex, [items, initialIndex]);

  useLayoutEffect(() => {
    if (items.length === 0) return;
    if (scrollKeyRef.current === key) return;
    scrollKeyRef.current = key;
    const safe = Math.min(Math.max(0, initialIndex), items.length - 1);
    const id = items[safe]?.messageId;
    if (!id) return;
    requestAnimationFrame(() => {
      document.getElementById(`chat-share-section-${id}`)?.scrollIntoView({ block: "start", behavior: "auto" });
    });
  }, [items, initialIndex, key]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
      scrollKeyRef.current = "";
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[380] flex justify-center bg-background">
      <div className="flex h-[100dvh] w-full max-w-md flex-col overflow-hidden">
        <header className="flex shrink-0 items-center gap-3 px-3 py-2.5">
          <button type="button" onClick={onClose} className="shrink-0 rounded-full p-2 hover:bg-secondary" aria-label="إغلاق">
            <X size={22} />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-semibold">مشاركات المحادثة</h1>
            <p className="truncate text-[11px] text-muted-foreground">مرّر لأعلى أو لأسفل بين المنشورات والستوريات المشتركة</p>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-none [scrollbar-gutter:stable]">
          {items.map(item => (
            <section
              key={item.messageId}
              id={`chat-share-section-${item.messageId}`}
              className="flex min-h-[100dvh] flex-col bg-background"
            >
              {item.shareText && (
                <div className="shrink-0 px-4 pb-2 pt-3 text-sm text-muted-foreground">
                  <span className="text-foreground/90">&quot;{item.shareText}&quot;</span>
                </div>
              )}
              {item.kind === "post" ? <ShareFeedPostSection postId={item.targetId} /> : <ShareFeedStorySection storyId={item.targetId} />}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
