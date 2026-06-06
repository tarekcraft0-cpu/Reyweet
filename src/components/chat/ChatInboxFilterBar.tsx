import type { ChatInboxFilterId } from "@/lib/chatInboxFilters";
import { CHAT_INBOX_FILTERS } from "@/lib/chatInboxFilters";

type Props = {
  value: ChatInboxFilterId;
  onChange: (id: ChatInboxFilterId) => void;
  counts: Record<ChatInboxFilterId, number>;
  lang: string;
  isRtl: boolean;
};

export function ChatInboxFilterBar({ value, onChange, counts, lang, isRtl }: Props) {
  return (
    <div
      className="chat-inbox-filter-bar px-4 pt-2.5 pb-1"
      dir={isRtl ? "rtl" : "ltr"}
      role="tablist"
      aria-label={isRtl ? "تصفية المحادثات" : "Filter conversations"}
    >
      <div className="chat-inbox-filter-track flex gap-1.5 overflow-x-auto no-scrollbar">
        {CHAT_INBOX_FILTERS.map(opt => {
          const active = value === opt.id;
          const count = counts[opt.id];
          const showBadge = opt.id !== "all" && count > 0;
          const label = lang === "en" ? opt.labelEn : opt.labelAr;
          return (
            <button
              key={opt.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(opt.id)}
              className={
                "chat-inbox-filter-pill shrink-0 touch-manipulation " +
                (active ? "chat-inbox-filter-pill--active" : "")
              }
            >
              <span>{label}</span>
              {showBadge ? (
                <span className="chat-inbox-filter-badge" aria-hidden>
                  {count > 99 ? "99+" : count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
