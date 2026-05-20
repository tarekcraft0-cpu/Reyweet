import { cn } from "@/lib/utils";
import { resolveMediaUrl } from "@/lib/mediaUrl";
import { useEffect, useMemo, useState } from "react";

interface Props {
  name?: string;
  src?: string;
  size?: number;
  className?: string;
  ring?: boolean;
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
  return /^https?:\/\//i.test(s);
}

export function Avatar({ name = "?", src, size = 40, className, ring }: Props) {
  const initials = name.slice(0, 2).toUpperCase();
  const [imgFailed, setImgFailed] = useState(false);
  const resolvedSrc = useMemo(() => resolveMediaUrl(src), [src]);

  useEffect(() => {
    setImgFailed(false);
  }, [resolvedSrc]);

  const showImg = !!(resolvedSrc && isRenderableAvatarImageUrl(resolvedSrc) && !imgFailed);
  const showEmoji = !!(resolvedSrc && !showImg && resolvedSrc.length <= 4);

  const inner = (
    <div
      className={cn(
        "rounded-full bg-secondary text-secondary-foreground flex items-center justify-center overflow-hidden font-semibold select-none",
        className
      )}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {showImg ? (
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
      <div className="story-ring inline-block">
        <div className="bg-background rounded-full p-[2px]">{inner}</div>
      </div>
    );
  }
  return inner;
}
