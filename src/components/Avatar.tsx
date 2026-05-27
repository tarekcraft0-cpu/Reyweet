import { cn } from "@/lib/utils";
import { resolveMediaUrl } from "@/lib/mediaUrl";
import { isVideoMediaRef } from "@/lib/postMedia";
import { useEffect, useMemo, useState } from "react";

interface Props {
  name?: string;
  src?: string;
  size?: number;
  className?: string;
  ring?: boolean;
  /** حلقة باهتة — تمت مشاهدة كل الستوريات */
  ringSeen?: boolean;
}

/** يتعرّف على صور الرفع (data URL) والروابط و blob — بحساسية غير مهمة لحالة الأحرف */
function isRenderableAvatarImageUrl(src: string): boolean {
  const s = src.trim();
  if (!s) return false;
  const low = s.toLowerCase();
  if (low.startsWith("blob:")) return true;
  if (low.startsWith("data:image/")) return true;
  if (low.startsWith("data:") && (low.includes("image/") || low.includes("base64,"))) return true;
  if (low.startsWith("/media/")) return true;
  if (low.startsWith("/stickers/") || low.startsWith("/app/")) return true;
  return /^https?:\/\//i.test(s);
}

export function Avatar({ name = "?", src, size = 40, className, ring, ringSeen }: Props) {
  const initials = name.slice(0, 2).toUpperCase();
  const [imgFailed, setImgFailed] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const resolvedSrc = useMemo(() => resolveMediaUrl(src), [src]);
  const isVideoAvatar = !!(resolvedSrc && isVideoMediaRef(resolvedSrc));

  useEffect(() => {
    setImgFailed(false);
    setVideoFailed(false);
  }, [resolvedSrc]);

  const showVideo = !!(resolvedSrc && isVideoAvatar && !videoFailed);
  const showImg = !!(
    resolvedSrc &&
    !isVideoAvatar &&
    isRenderableAvatarImageUrl(resolvedSrc) &&
    !imgFailed
  );
  const showEmoji = !!(resolvedSrc && !showImg && !showVideo && resolvedSrc.length <= 4);

  const inner = (
    <div
      className={cn(
        "rounded-full bg-secondary text-secondary-foreground flex items-center justify-center overflow-hidden font-semibold select-none",
        className
      )}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {showVideo ? (
        <span className="relative block h-full w-full min-h-0 min-w-0 overflow-hidden rounded-full">
          <video
            key={resolvedSrc}
            src={resolvedSrc}
            className="absolute inset-0 h-full w-full object-cover scale-[1.01]"
            muted
            playsInline
            loop
            autoPlay
            draggable={false}
            preload="auto"
            aria-hidden
            onError={() => setVideoFailed(true)}
            onLoadedData={e => {
              const v = e.currentTarget;
              void v.play().catch(() => undefined);
            }}
          />
          <span className="sr-only">{name}</span>
        </span>
      ) : showImg ? (
        <span className="relative block h-full w-full min-h-0 min-w-0 overflow-hidden rounded-full">
          <img
            key={resolvedSrc}
            src={resolvedSrc}
            alt={name}
            className="absolute inset-0 h-full w-full object-cover"
            draggable={false}
            decoding="async"
            loading="eager"
            onError={() => setImgFailed(true)}
          />
        </span>
      ) : showEmoji ? (
        <span style={{ fontSize: size * 0.55 }}>{resolvedSrc}</span>
      ) : (
        initials
      )}
    </div>
  );
  if (ring) {
    return (
      <div
        className={
          "inline-block " + (ringSeen ? "story-ring-seen" : "story-ring-brand")
        }
      >
        <div className="bg-background rounded-full p-[2px]">{inner}</div>
      </div>
    );
  }
  return inner;
}
