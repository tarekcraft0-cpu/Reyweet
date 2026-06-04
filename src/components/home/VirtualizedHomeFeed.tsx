import { memo, useCallback, useEffect, useRef, type RefObject } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { isNativeCapacitorShell } from "@/lib/apiUrlPolicy";
import { stableVirtualRowMeasure } from "@/lib/safeVirtualizerMeasure";
import { HomeFeedPostItem } from "./HomeFeedPostItem";
import { HomeFeedActionsProvider } from "@/lib/homeFeedActionsContext";
import { useProfiledRender } from "@/lib/renderProfiler";
import type { Post } from "@/lib/types";

const OVERSCAN = isNativeCapacitorShell() ? 2 : 3;

/** تقدير أولي قريب من الارتفاع الحقيقي — يمنع فراغات 480px بين المنشورات القصيرة */
function estimatePostRowHeight(post: Post): number {
  if (post.image || post.video) return 520;
  if (post.audio) return 220;
  const len = (post.text || "").trim().length;
  if (len === 0) return 200;
  if (len < 60) return 260;
  if (len < 180) return 320;
  return 400;
}

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
    estimateSize: index => {
      const p = posts[index];
      return p ? estimatePostRowHeight(p) : 300;
    },
    overscan: OVERSCAN,
    getItemKey: index => posts[index]?.id ?? index,
    measureElement: stableVirtualRowMeasure,
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
