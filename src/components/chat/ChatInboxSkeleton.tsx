import { CHAT_INBOX_ROW_HEIGHT_PX } from "@/lib/chatInboxUtils";

const NAME_WIDTHS = ["38%", "52%", "44%", "48%", "40%", "56%", "46%"];
const PREVIEW_WIDTHS = ["62%", "74%", "58%", "70%", "66%", "54%", "68%"];

export function ChatInboxSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div
      className="chat-inbox-skeleton"
      aria-busy="true"
      aria-label="جاري تحميل المحادثات"
      role="status"
    >
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="chat-inbox-skeleton-row flex flex-row items-center border-b border-border/35 px-3.5"
          style={{ minHeight: CHAT_INBOX_ROW_HEIGHT_PX }}
        >
          <div className="h-[58px] w-[58px] shrink-0 rounded-full bg-secondary/90" />
          <div className="ms-3 flex min-w-0 flex-1 flex-col gap-2.5 py-3">
            <div
              className="h-4 rounded-md bg-secondary/85"
              style={{ width: NAME_WIDTHS[i % NAME_WIDTHS.length] }}
            />
            <div
              className="h-3.5 rounded-md bg-secondary/65"
              style={{ width: PREVIEW_WIDTHS[i % PREVIEW_WIDTHS.length] }}
            />
          </div>
          <div className="ms-2 h-3 w-10 shrink-0 rounded bg-secondary/55" />
        </div>
      ))}
    </div>
  );
}
