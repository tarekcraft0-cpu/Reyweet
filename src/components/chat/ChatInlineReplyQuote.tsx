import { userById } from "@/lib/store";
import type { AppState, Message } from "@/lib/types";
import { useT } from "@/lib/i18n";
import { isStickerImageContent, isStickerVideoContent } from "@/lib/stickerUtils";

function truncateText(s: string, max: number) {
  const t = (s ?? "").trim();
  if (t.length <= max) return t;
  return t.slice(0, max) + "…";
}

function replyBody(replyTo: NonNullable<Message["replyTo"]>): string {
  if (replyTo.type === "text") return truncateText(replyTo.content, 120);
  if (replyTo.type === "sticker" && isStickerImageContent(replyTo.content)) return "[ملصق]";
  return truncateText(replyTo.content || `[${replyTo.type}]`, 80);
}

export function ChatInlineReplyQuote({
  replyTo,
  messages,
  meId,
  state,
  mine,
  isQuran,
  onJumpToOriginal,
}: {
  replyTo: NonNullable<Message["replyTo"]>;
  messages: Message[];
  meId: string;
  state: AppState;
  mine: boolean;
  isQuran: boolean;
  onJumpToOriginal?: (messageId: string) => void;
}) {
  const t = useT();
  const orig = messages.find(m => m.id === replyTo.id);
  const origSender = orig ? userById(state, orig.senderId) : null;
  const repliedToMe = orig?.senderId === meId;

  const label = repliedToMe
    ? t("chatRepliedToYou")
    : origSender
      ? `${t("chatRepliedTo")} @${origSender.username}`
      : t("chatReply");

  const canJump = !!orig && !!onJumpToOriginal;

  return (
    <div
      role={canJump ? "button" : undefined}
      tabIndex={canJump ? 0 : undefined}
      onClick={
        canJump
          ? () => {
              onJumpToOriginal!(replyTo.id);
            }
          : undefined
      }
      onKeyDown={
        canJump
          ? e => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onJumpToOriginal!(replyTo.id);
              }
            }
          : undefined
      }
      className={
        "mb-1.5 max-w-full select-none rounded-lg border-s-[3px] px-2 py-1.5 " +
        (canJump ? "cursor-pointer touch-manipulation active:opacity-80 " : "") +
        (isQuran
          ? mine
            ? "border-emerald-300/70 bg-black/25"
            : "border-zinc-400/80 bg-black/30"
          : mine
            ? "border-zinc-500/50 bg-black/[0.08] dark:border-white/25 dark:bg-black/25"
            : "border-zinc-500/45 bg-black/[0.06] dark:border-white/20 dark:bg-black/35")
      }
    >
      <p
        className={
          "mb-0.5 text-[10px] font-semibold leading-tight " +
          (isQuran ? "text-zinc-300/90" : "text-zinc-500 dark:text-zinc-400")
        }
      >
        {label}
      </p>
      <p
        className={
          "line-clamp-2 text-[11px] leading-snug " +
          (isQuran ? "text-zinc-100/85" : "text-zinc-700/90 dark:text-zinc-200/85")
        }
      >
        {replyBody(replyTo)}
      </p>
    </div>
  );
}

