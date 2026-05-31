import { cn } from "@/lib/utils";
import { getMediaServingOrigin, resolveMediaUrl } from "@/lib/mediaUrl";
import { isVideoMediaRef } from "@/lib/postMedia";
import { DEFAULT_AVATAR_DATA_URI } from "@/lib/defaultAvatar";
import { useEffect, useMemo, useState } from "react";

interface Props {
  name?: string;
  src?: string;
  size?: number;
  className?: string;
  ring?: boolean;
  /** حلقة باهتة — تمت مشاهدة كل الستوريات */
  ringSeen?: boolean;
  /** eager للصورة الرئيسية فقط (مثل بروفايل المستخدم) */
  priority?: boolean;
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

export function Avatar({ name = "?", src, size = 40, className, ring, ringSeen, priority = false }: Props) {
  const [imgFailed, setImgFailed] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const resolvedSrc = useMemo(() => {
    const resolved = resolveMediaUrl(src);
    if (resolved) return resolved;
    const raw = src?.trim() || "";
    if (raw.startsWith("/media/") || raw.startsWith("/stickers/") || raw.startsWith("/public/")) {
      return `${getMediaServingOrigin().replace(/\/$/, "")}${raw}`;
    }
    return resolved;
  }, [src]);
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
  const showEmoji = !!(
    resolvedSrc &&
    !showImg &&
    !showVideo &&
    resolvedSrc.length <= 4 &&
    /[^\p{L}\p{N}]/u.test(resolvedSrc)
  );

  const imgLoading = priority ? "eager" : "lazy";

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
            preload={priority ? "auto" : "metadata"}
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
            loading={imgLoading}
            onError={() => setImgFailed(true)}
          />
        </span>
      ) : showEmoji ? (
        <span style={{ fontSize: size * 0.55 }}>{resolvedSrc}</span>
      ) : (
        <span className="relative block h-full w-full min-h-0 min-w-0 overflow-hidden rounded-full">
          <img
            src={DEFAULT_AVATAR_DATA_URI}
            alt={name}
            className="absolute inset-0 h-full w-full object-cover"
            draggable={false}
            decoding="async"
            loading={imgLoading}
          />
        </span>
      )}
    </div>
  );
  if (ring) {
    return ringSeen ? (
      <div className="story-ring-seen inline-block">
        <div className="bg-background rounded-full p-[2px]">{inner}</div>
      </div>
    ) : (
      <div className="story-ring-live-outer">
        <div className="story-ring-live-inner">{inner}</div>
      </div>
    );
  }
  return inner;
}
