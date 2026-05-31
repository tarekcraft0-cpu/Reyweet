import { memo, useCallback, useEffect, useRef, type RefObject } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { HomeFeedPostItem } from "./HomeFeedPostItem";
import { HomeFeedActionsProvider } from "@/lib/homeFeedActionsContext";
import { useProfiledRender } from "@/lib/renderProfiler";
import type { Post } from "@/lib/types";

const ESTIMATE_PX = 480;
const OVERSCAN = 3;

type FeedActions = {
  onShare: (post: Post) => void;
  onOpenProfile: (id: string) => void;
  onOpenChat: (chatId: string) => void;
  openPost: (postId: string) => void;
  openCommentsSheet: (postId: string) => void;
};

type Props = {
  posts: Post[];
  scrollRef: RefObject<HTMLElement | null>;
  headerOffsetPx: number;
  feedHasMore: boolean;
  onLoadMore: () => void;
  feedActions: FeedActions;
};

/** قائمة خلاصة افتراضية — DOM للعناصر المرئية ± overscan فقط */
export const VirtualizedHomeFeed = memo(function VirtualizedHomeFeed({
  posts,
  scrollRef,
  headerOffsetPx,
  feedHasMore,
  onLoadMore,
  feedActions,
}: Props) {
  useProfiledRender("VirtualizedHomeFeed");

  const getScrollElement = useCallback(() => scrollRef.current, [scrollRef]);

  const virtualizer = useVirtualizer({
    count: posts.length,
    getScrollElement,
    estimateSize: () => ESTIMATE_PX,
    overscan: OVERSCAN,
    getItemKey: index => posts[index]?.id ?? index,
  });

  const virtualItems = virtualizer.getVirtualItems();
  const lastVisibleIndex = virtualItems[virtualItems.length - 1]?.index ?? -1;
  const loadMoreFiredRef = useRef(-1);

  useEffect(() => {
    if (lastVisibleIndex < 0 || !feedHasMore) return;
    if (lastVisibleIndex < posts.length - 5) return;
    if (loadMoreFiredRef.current === lastVisibleIndex) return;
    loadMoreFiredRef.current = lastVisibleIndex;
    onLoadMore();
  }, [lastVisibleIndex, posts.length, feedHasMore, onLoadMore]);

  if (!posts.length) return null;

  return (
    <HomeFeedActionsProvider value={feedActions}>
      <div
        className="relative w-full"
        style={{ height: virtualizer.getTotalSize() + headerOffsetPx }}
      >
        {virtualItems.map(vi => {
          const post = posts[vi.index];
          if (!post) return null;
          return (
            <div
              key={post.id}
              data-index={vi.index}
              ref={virtualizer.measureElement}
              className="absolute start-0 w-full"
              style={{
                top: 0,
                transform: `translateY(${vi.start + headerOffsetPx}px)`,
              }}
            >
              <HomeFeedPostItem post={post} />
            </div>
          );
        })}
      </div>
    </HomeFeedActionsProvider>
  );
});
