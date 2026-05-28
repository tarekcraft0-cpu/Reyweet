import { Avatar } from "../Avatar";

type Props = {
  name?: string;
  src?: string;
  size?: number;
  ring?: boolean;
  className?: string;
};

/** صورة الحساب: إن لم توجد صورة مرفوعة نستخدم الأفتار الافتراضي الرسمي */
export function RSocialAvatar({ name = "?", src, size = 48, ring, className }: Props) {
  const inner = (
    <Avatar name={name} src={src} size={size} className={className} />
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
