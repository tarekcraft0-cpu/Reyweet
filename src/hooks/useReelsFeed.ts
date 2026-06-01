import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Post, User } from "@/lib/types";
import {
  apiFetchReelsFeed,
  normalizeReelMediaUrls,
  reelMetaFromPublic,
  reelPublicToPost,
  reelsApiEnabled,
  type ReelMeta,
  type ReelsFeedResponse,
} from "@/lib/reelsApi";
import { useReelsPosts } from "@/lib/appHooks";

export function useReelsFeed(
  meId: string,
  blocked: string[],
  following: string[],
  tab: "all" | "friends",
) {
  const legacyReels = useReelsPosts(meId, blocked);
  const apiOn = reelsApiEnabled();

  const [apiPosts, setApiPosts] = useState<Post[]>([]);
  const [reelMeta, setReelMeta] = useState<Record<string, ReelMeta>>({});
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [useApi, setUseApi] = useState(apiOn);
  const loadingRef = useRef(false);

  const legacyFiltered = useMemo(() => {
    if (tab === "friends") {
      const set = new Set(following);
      set.add(meId);
      return legacyReels.filter(p => set.has(p.userId));
    }
    return legacyReels;
  }, [legacyReels, tab, following, meId]);

  const applyFeedPage = useCallback(
    (append: boolean, data: ReelsFeedResponse) => {
      const posts = data.reels.map(r => {
        const norm = normalizeReelMediaUrls(r);
        return reelPublicToPost(norm, meId);
      });
      const meta: Record<string, ReelMeta> = {};
      for (const r of data.reels) {
        const norm = normalizeReelMediaUrls(r);
        meta[norm.postId || norm.id] = reelMetaFromPublic(norm);
      }
      setApiPosts(prev => (append ? [...prev, ...posts] : posts));
      setReelMeta(prev => (append ? { ...prev, ...meta } : meta));
      setHasMore(data.hasMore);
      setCursor(data.nextCursor);
    },
    [meId],
  );

  const loadPage = useCallback(
    async (opts?: { reset?: boolean }) => {
      if (!apiOn || loadingRef.current) return;
      loadingRef.current = true;
      setLoading(true);
      try {
        const res = await apiFetchReelsFeed({
          limit: 15,
          cursor: opts?.reset ? undefined : cursor,
          scope: tab,
        });
        if (!res.ok) {
          setUseApi(false);
          return;
        }
        setUseApi(true);
        applyFeedPage(!opts?.reset, res.data);
        setCursor(res.data.nextCursor);
      } finally {
        loadingRef.current = false;
        setLoading(false);
      }
    },
    [apiOn, applyFeedPage, cursor, tab],
  );

  const refresh = useCallback(async () => {
    if (!apiOn) return;
    setCursor(undefined);
    await loadPage({ reset: true });
  }, [apiOn, loadPage]);

  const loadMore = useCallback(async () => {
    if (!useApi || !hasMore || loadingRef.current || !cursor) return;
    await loadPage({ reset: false });
  }, [useApi, hasMore, cursor, loadPage]);

  useEffect(() => {
    if (!apiOn) {
      setUseApi(false);
      return;
    }
    setApiPosts([]);
    setReelMeta({});
    setHasMore(false);
    setCursor(undefined);
    void loadPage({ reset: true });
  }, [apiOn, tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const reels = useApi ? apiPosts : legacyFiltered;

  const patchReelMeta = useCallback((postId: string, patch: Partial<ReelMeta>) => {
    setReelMeta(prev => {
      const base: ReelMeta = {
        likesCount: 0,
        commentsCount: 0,
        viewsCount: 0,
        likedByMe: false,
        ...prev[postId],
        ...patch,
      };
      return { ...prev, [postId]: base };
    });
  }, []);

  const getLikeCount = useCallback(
    (post: Post) => reelMeta[post.id]?.likesCount ?? post.likes.length,
    [reelMeta],
  );

  const getCommentCount = useCallback(
    (post: Post) => reelMeta[post.id]?.commentsCount ?? post.comments.length,
    [reelMeta],
  );

  const isLiked = useCallback(
    (post: Post) => reelMeta[post.id]?.likedByMe ?? post.likes.includes(meId),
    [reelMeta, meId],
  );

  return {
    reels,
    useApi,
    loading,
    hasMore,
    refresh,
    loadMore,
    reelMeta,
    patchReelMeta,
    getLikeCount,
    getCommentCount,
    isLiked,
  };
}
