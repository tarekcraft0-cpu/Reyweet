import { useMemo, useRef } from "react";
import { Play } from "lucide-react";
import type { Post } from "@/lib/types";
import { normalizePostMedia, resolvePostDisplayType } from "@/lib/postMedia";
import { cn } from "@/lib/utils";

type Props = {
  post: Pick<Post, "image" | "video" | "type" | "text">;
  className?: string;
  showVideoBadge?: boolean;
};

/** معاينة شبكة البروفايل/الاستكشاف — صورة أو إطار أول من الفيديو (مثل إنستغرام) */
export function PostGridThumbnail({ post, className, showVideoBadge = true }: Props) {
  const displayType = useMemo(
    () => resolvePostDisplayType(post),
    [post.type, post.image, post.video, post.text],
  );
  const media = useMemo(
    () => normalizePostMedia(post),
    [post.image, post.video, post.type],
  );
  const videoRef = useRef<HTMLVideoElement>(null);

  if (displayType === "tweet") {
    const textPreview = post.text?.trim();
    return (
      <div
        className={cn(
          "absolute inset-0 flex flex-col justify-center bg-gradient-to-br from-zinc-50 to-zinc-100 p-2.5 dark:from-zinc-900 dark:to-zinc-950",
          className,
        )}
      >
        {textPreview ? (
          <p className="line-clamp-6 text-start text-[11px] leading-snug text-foreground">{textPreview}</p>
        ) : (
          <span className="text-center text-2xl text-muted-foreground" aria-hidden>
            💬
          </span>
        )}
      </div>
    );
  }

  if (media.hasImage && !media.hasVideo) {
    return (
      <img
        src={media.imageUrl}
        alt=""
        className={cn("absolute inset-0 h-full w-full object-cover", className)}
        loading="lazy"
        decoding="async"
      />
    );
  }

  if (media.hasVideo) {
    const seekPreview = () => {
      const v = videoRef.current;
      if (!v || v.readyState < 1) return;
      try {
        if (v.currentTime < 0.05) v.currentTime = 0.12;
      } catch {
        /* ignore */
      }
    };

    return (
      <>
        {media.posterUrl ? (
          <img
            src={media.posterUrl}
            alt=""
            className={cn("absolute inset-0 h-full w-full object-cover", className)}
            loading="lazy"
            decoding="async"
          />
        ) : (
          <video
            ref={videoRef}
            src={media.videoUrl}
            className={cn("absolute inset-0 h-full w-full object-cover bg-muted", className)}
            muted
            playsInline
            preload="auto"
            crossOrigin={
              media.videoUrl.startsWith("http://") || media.videoUrl.startsWith("https://")
                ? "anonymous"
                : undefined
            }
            onLoadedMetadata={seekPreview}
            onLoadedData={seekPreview}
          />
        )}
        {showVideoBadge && (
          <span className="pointer-events-none absolute end-1 top-1 z-[1] rounded bg-black/55 p-0.5 text-white shadow">
            <Play size={12} fill="currentColor" />
          </span>
        )}
      </>
    );
  }

  if (media.emojiFallback) {
    return (
      <span className={cn("text-2xl text-muted-foreground", className)}>
        {media.emojiFallback}
      </span>
    );
  }

  const textPreview = (post as { text?: string }).text?.trim();
  if (textPreview) {
    return (
      <div
        className={cn(
          "absolute inset-0 flex items-center justify-center bg-zinc-100 p-2 text-center text-[10px] leading-snug text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200",
          className,
        )}
      >
        <span className="line-clamp-6">{textPreview}</span>
      </div>
    );
  }

  return null;
}
