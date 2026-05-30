import { CHAT_INBOX_ROW_HEIGHT_PX } from "@/lib/chatInboxUtils";

export function ChatInboxSkeleton({ rows = 7 }: { rows?: number }) {
  return (
    <div className="animate-pulse" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="flex flex-row items-center border-b border-border/40 px-3.5"
          style={{ minHeight: CHAT_INBOX_ROW_HEIGHT_PX }}
        >
          <div className="h-[58px] w-[58px] shrink-0 rounded-full bg-secondary" />
          <div className="ms-3 flex min-w-0 flex-1 flex-col gap-2 py-3">
            <div className="h-4 w-[42%] rounded-md bg-secondary" />
            <div className="h-3.5 w-[68%] rounded-md bg-secondary/80" />
          </div>
          <div className="ms-2 h-3 w-10 shrink-0 rounded bg-secondary/70" />
        </div>
      ))}
    </div>
  );
}
