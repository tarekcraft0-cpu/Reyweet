import type { MouseEvent, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * يعرض النص مع تمييز @اسم و#وسم فقط.
 * لا يُقسّم على كل مسافة — ذلك كان يسبب تباعداً غريباً في العربية بين الحروف على بعض المتصفحات.
 */
const MENTION_OR_HASHTAG = /(@[a-z0-9_]{1,30})|(#[\w\u0600-\u06FF]+)/gi;

export type MentionPillVariant = "default" | "mine" | "glass" | "composer" | "composerQuran";

export function mentionPillClassName(variant: MentionPillVariant = "default"): string {
  switch (variant) {
    case "mine":
      return "inline-flex max-w-full items-center rounded-full bg-white/28 px-1.5 py-px text-[0.9em] font-semibold leading-snug text-white align-baseline";
    case "glass":
      return "inline-flex max-w-full items-center rounded-full bg-white/22 px-1.5 py-px text-[0.9em] font-semibold leading-snug text-white align-baseline";
    case "composerQuran":
      return "inline-flex max-w-full items-center rounded-full bg-emerald-400/22 px-1.5 py-px text-[0.9em] font-semibold leading-snug text-emerald-100 align-baseline";
    case "composer":
      return "inline-flex max-w-full items-center rounded-full bg-[#0084ff]/18 px-1.5 py-px text-[0.9em] font-semibold leading-snug text-[#0084ff] align-baseline dark:bg-[#0084ff]/28 dark:text-[#6eb6ff]";
    default:
      return "inline-flex max-w-full items-center rounded-full bg-[#0084ff]/14 px-1.5 py-px text-[0.9em] font-semibold leading-snug text-[#0084ff] align-baseline dark:bg-[#0084ff]/22 dark:text-[#6eb6ff]";
  }
}

export function MentionPill({
  username,
  variant = "default",
  className,
  onClick,
}: {
  username: string;
  variant?: MentionPillVariant;
  className?: string;
  onClick?: (e: MouseEvent) => void;
}) {
  const cls = cn(mentionPillClassName(variant), className);
  /** عرض المنشن: username يمين + @ يسار — مناسب للنص العربي RTL
   *  dir="rtl" + flex يجعل العنصر الأول (username) يظهر يميناً والثاني (@) يساراً */
  const content = (
    <span className="inline-flex items-center gap-px" dir="rtl">
      <span dir="ltr">{username}</span>
      <span>@</span>
    </span>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cls}>
        {content}
      </button>
    );
  }
  return <span className={cls}>{content}</span>;
}

export function createMentionRenderer(opts: {
  variant?: MentionPillVariant;
  users?: { id: string; username: string }[];
  onUserClick?: (userId: string) => void;
  onUsernameClick?: (username: string) => void;
}): (username: string, key: string) => ReactNode {
  const variant = opts.variant ?? "default";
  return (username: string, key: string) => {
    const u = opts.users?.find(x => x.username.toLowerCase() === username.toLowerCase());
    const onClick =
      opts.onUserClick || opts.onUsernameClick
        ? (e: MouseEvent) => {
            e.stopPropagation();
            if (u && opts.onUserClick) opts.onUserClick(u.id);
            else opts.onUsernameClick?.(username);
          }
        : undefined;
    return <MentionPill key={key} username={username} variant={variant} onClick={onClick} />;
  };
}

export function renderMentionHashtagNodes(
  raw: string,
  opts: {
    renderMention: (username: string, key: string) => ReactNode;
    renderHashtag: (hashtagWithHash: string, key: string) => ReactNode;
  },
): ReactNode[] {
  const text = raw.length > 12000 ? raw.slice(0, 12000) + "…" : raw;
  const out: ReactNode[] = [];
  let last = 0;
  let k = 0;
  for (const m of text.matchAll(MENTION_OR_HASHTAG)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push(<span key={`t${k++}`}>{text.slice(last, idx)}</span>);
    const piece = m[0];
    if (piece.startsWith("@")) out.push(opts.renderMention(piece.slice(1), `m${k++}`));
    else out.push(opts.renderHashtag(piece, `h${k++}`));
    last = idx + piece.length;
  }
  if (last < text.length) out.push(<span key={`t${k++}`}>{text.slice(last)}</span>);
  return out;
}

/** طبقة خلف حقل الكتابة — المنشن يظهر ببالون أزرق أثناء الكتابة */
export function renderComposerMentionOverlay(
  text: string,
  variant: MentionPillVariant = "composer",
): ReactNode[] {
  if (!text) return [];
  return renderMentionHashtagNodes(text, {
    renderMention: (uname, key) => (
      <MentionPill key={key} username={uname} variant={variant} />
    ),
    renderHashtag: (h, key) => (
      <span key={key} className="text-inherit">
        {h}
      </span>
    ),
  });
}
