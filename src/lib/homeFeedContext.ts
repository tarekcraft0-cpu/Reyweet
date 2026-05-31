import { createContext, useContext } from "react";
import type { Post } from "./types";

export type HomeFeedCtxValue = {
  /** منشورات الخلاصة مرتّبة — تتحدث فقط عند تغيّر الفيد */
  homeFeedPosts: Post[];
  feedHasMore: boolean;
};

export const HomeFeedCtx = createContext<HomeFeedCtxValue>({
  homeFeedPosts: [],
  feedHasMore: false,
});

export function useHomeFeed(): HomeFeedCtxValue {
  return useContext(HomeFeedCtx);
}
