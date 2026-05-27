import { memo, useCallback } from "react";
import { PostCard } from "../PostCard";
import { useHomeFeedActions } from "@/lib/homeFeedActionsContext";
import { postFeedSignature } from "@/lib/postFeedSignature";
import type { Post } from "@/lib/types";

export const HomeFeedPostItem = memo(
  function HomeFeedPostItem({ post }: { post: Post }) {
    const { onShare, onOpenProfile, onOpenChat, openPost, openCommentsSheet } =
      useHomeFeedActions();

    const onOpen = useCallback(() => openPost(post.id), [openPost, post.id]);
    const onOpenCommentsSheet = useCallback(
      () => openCommentsSheet(post.id),
      [openCommentsSheet, post.id],
    );

    return (
      <PostCard
        post={post}
        onShare={onShare}
        onOpenProfile={onOpenProfile}
        profileReturnTab="home"
        onOpenChat={onOpenChat}
        onOpen={onOpen}
        onOpenCommentsSheet={onOpenCommentsSheet}
        hideQuickComment
      />
    );
  },
  (prev, next) => postFeedSignature(prev.post) === postFeedSignature(next.post),
);
