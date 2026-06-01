import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { isNativeMobileApp } from "@/lib/nativeStability";
import type { Chat } from "@/lib/types";
import { CHAT_INBOX_ROW_HEIGHT_PX } from "@/lib/chatInboxUtils";

type Props = {
  chats: Chat[];
  scrollParentRef: React.RefObject<HTMLElement | null>;
  /** بداية القائمة داخل حاوية التمرير (بعد النوتات/البحث) */
  scrollMargin?: number;
  renderRow: (chat: Chat, index: number) => ReactNode;
};

function ChatInboxSimpleList({ chats, renderRow }: Pick<Props, "chats" | "renderRow">) {
  return (
    <div className="relative w-full">
      {chats.map((chat, index) => (
        <div key={chat.id}>{renderRow(chat, index)}</div>
      ))}
    </div>
  );
}

function ChatInboxVirtualListInner({
  chats,
  scrollParentRef,
  scrollMargin = 0,
  renderRow,
}: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  const [margin, setMargin] = useState(scrollMargin);

  useLayoutEffect(() => {
    setMargin(prev => (prev === scrollMargin ? prev : scrollMargin));
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

/**
 * قائمة محادثات — على iOS/Capacitor بدون react-virtual (يمنع #185).
 */
export function ChatInboxVirtualList(props: Props) {
  if (isNativeMobileApp()) {
    return <ChatInboxSimpleList chats={props.chats} renderRow={props.renderRow} />;
  }
  return <ChatInboxVirtualListInner {...props} />;
}
