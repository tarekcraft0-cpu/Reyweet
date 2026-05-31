import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { Chat } from "@/lib/types";
import { CHAT_INBOX_ROW_HEIGHT_PX } from "@/lib/chatInboxUtils";

type Props = {
  chats: Chat[];
  scrollParentRef: React.RefObject<HTMLElement | null>;
  /** بداية القائمة داخل حاوية التمرير (بعد النوتات/البحث) */
  scrollMargin?: number;
  renderRow: (chat: Chat, index: number) => ReactNode;
};

/**
 * قائمة محادثات افتراضية — تمرير سلس مع آلاف المحادثات.
 * يتطلب أن يكون `scrollParentRef` على الحاوية ذات overflow-y.
 */
export function ChatInboxVirtualList({
  chats,
  scrollParentRef,
  scrollMargin = 0,
  renderRow,
}: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  const [margin, setMargin] = useState(scrollMargin);

  useLayoutEffect(() => {
    setMargin(scrollMargin);
  }, [scrollMargin]);

  const virtualizer = useVirtualizer({
    count: chats.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => CHAT_INBOX_ROW_HEIGHT_PX,
    overscan: 10,
    scrollMargin: margin,
    getItemKey: index => chats[index]?.id ?? index,
  });

  const items = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  return (
    <div ref={listRef} className="relative w-full" style={{ height: totalSize }}>
      {items.map(vi => {
        const chat = chats[vi.index];
        if (!chat) return null;
        return (
          <div
            key={vi.key}
            data-chat-inbox-index={vi.index}
            className="absolute start-0 top-0 w-full"
            style={{
              height: vi.size,
              transform: `translateY(${vi.start - margin}px)`,
            }}
          >
            {renderRow(chat, vi.index)}
          </div>
        );
      })}
    </div>
  );
}
