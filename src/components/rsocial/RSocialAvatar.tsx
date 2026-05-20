import { Avatar } from "../Avatar";
import { pastelAvatarColors } from "@/lib/rsocialUi";
import { resolveMediaUrl } from "@/lib/mediaUrl";
import { useEffect, useMemo, useState } from "react";

type Props = {
  name?: string;
  src?: string;
  size?: number;
  ring?: boolean;
  className?: string;
};

function canShowImage(src?: string): boolean {
  if (!src?.trim()) return false;
  const s = src.trim().toLowerCase();
  return (
    s.startsWith("data:image/") ||
    s.startsWith("blob:") ||
    s.startsWith("/media/") ||
    /^https?:\/\//i.test(s)
  );
}

/** صورة دائرية بأحرف أولى وألوان باستيل (مثل موكب R Social) */
export function RSocialAvatar({ name = "?", src, size = 48, ring, className }: Props) {
  const initials = name.replace(/^@/, "").slice(0, 2).toUpperCase();
  const resolved = useMemo(() => resolveMediaUrl(src), [src]);
  const [imgFailed, setImgFailed] = useState(false);
  useEffect(() => setImgFailed(false), [resolved]);

  const showImg = !!(resolved && canShowImage(resolved) && !imgFailed);
  const { bg, color } = pastelAvatarColors(name);

  const inner = showImg ? (
    <Avatar name={name} src={src} size={size} className={className} />
  ) : (
    <div
      className={
        "rounded-full flex items-center justify-center overflow-hidden font-bold select-none shrink-0 " +
        (className || "")
      }
      style={{
        width: size,
        height: size,
        fontSize: size * 0.34,
        backgroundColor: bg,
        color,
      }}
    >
      {initials}
    </div>
  );

  if (ring) {
    return (
      <div className="story-ring inline-block">
        <div className="rounded-full bg-white p-[2px]">{inner}</div>
      </div>
    );
  }
  return inner;
}
