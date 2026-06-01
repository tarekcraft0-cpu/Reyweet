import { memo } from "react";
import { HomeFeedPostItem } from "./HomeFeedPostItem";
import { HomeFeedActionsProvider } from "@/lib/homeFeedActionsContext";
import type { Post } from "@/lib/types";

type FeedActions = {
  onShare: (post: Post) => void;
  onOpenProfile: (id: string) => void;
  onOpenChat: (chatId: string) => void;
  openPost: (postId: string) => void;
  openCommentsSheet: (postId: string) => void;
};

type Props = {
  posts: Post[];
  feedActions: FeedActions;
};

/**
 * خلاصة بدون react-virtual — على Capacitor/iOS يمنع حلقة measureElement (#185).
 */
export const SimpleHomeFeed = memo(function SimpleHomeFeed({ posts, feedActions }: Props) {
  if (!posts.length) return null;

  return (
    <HomeFeedActionsProvider value={feedActions}>
      <div className="relative w-full">
        {posts.map(post => (
          <HomeFeedPostItem key={post.id} post={post} />
        ))}
      </div>
    </HomeFeedActionsProvider>
  );
});
