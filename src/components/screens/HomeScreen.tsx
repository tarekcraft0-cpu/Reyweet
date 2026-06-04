import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, memo } from "react";
import { isNativeCapacitorShell } from "@/lib/apiUrlPolicy";
import { isNativeMobileApp, isNativePostLoginQuietPeriod } from "@/lib/nativeStability";
import { VirtualizedHomeFeed } from "../home/VirtualizedHomeFeed";
import { HomePullToRefreshIndicator } from "../home/HomePullToRefreshIndicator";
import { useHomePullToRefresh } from "@/hooks/useHomePullToRefresh";
import { useTabPanelScrollRef } from "@/lib/tabPanelScrollContext";
import { useIsTabActive } from "@/lib/tabActiveContext";
import {
  useAppActions,
  useAppSelector,
  useHomeFeed,
  useIsGuestSelector,
  userById,
  visibleStoryFriendsUserIds,
} from "@/lib/store";
import { equalIdArrays } from "@/lib/useAppSelector";
import { useScreenPerf } from "@/lib/useScreenPerf";
import { useProfiledRender } from "@/lib/renderProfiler";
import { storyViewerTrayRing } from "@/lib/storyTray";
import { notifyGuestActionBlocked } from "@/lib/guestBlocked";
import { NEW_FEED_POST_EVENT } from "@/lib/feedVisibility";
import { useT } from "@/lib/i18n";
import { requestOpenStoryGallery } from "@/lib/camera/cameraEvents";
import { PostDetail } from "../PostDetail";
import { StoryViewer } from "../StoryViewer";
import { StoriesRow, type StoryOpenRequest } from "../stories/StoriesRow";
import { ShareSheet } from "../ShareSheet";
import { Avatar } from "../Avatar";
import type { Post, ProfileReturnContext } from "@/lib/types";
import { PlaySquare, X, Trash2 } from "lucide-react";

interface Props {
  onOpenProfile: (id: string, ctx?: ProfileReturnContext) => void;
  onOpenChat: (chatId: string) => void;
  /** يُمرَّر من App بعد الرجوع من بروفايل فتح منشور/تعليقات */
  restoreFromProfileContext?: ProfileReturnContext | null;
  onConsumedRestoreFromProfile?: () => void;
}

export const HomeScreen = memo(function HomeScreen({
  onOpenProfile,
  onOpenChat,
  restoreFromProfileContext = null,
  onConsumedRestoreFromProfile,
}: Props) {
  useProfiledRender("HomeScreen");
  const {
    addComment,
    deleteComment,
    refreshFeedFromServer,
    loadMoreFeedFromServer,
  } = useAppActions();
  const currentUser = useAppSelector(s => {
    const id = s.currentUserId;
    if (!id) return null;
    return userById(s, id) ?? null;
  });
  const isGuest = useIsGuestSelector();
  const posts = useAppSelector(s => s.posts);
  const users = useAppSelector(s => s.users);
  const { homeFeedPosts: feed, feedHasMore } = useHomeFeed();
  const isHomeTabActive = useIsTabActive("home");
  const nativeShell = isNativeMobileApp();
  const [refreshDoneHint, setRefreshDoneHint] = useState(false);
  useScreenPerf("HomeScreen", { active: isHomeTabActive });
  const t = useT();
  const [shareTarget, setShareTarget] = useState<Post | null>(null);
  const [storyOpen, setStoryOpen] = useState<StoryOpenRequest | null>(null);
  const [openPostId, setOpenPostId] = useState<string | null>(null);
  const [focusCommentsOnOpen, setFocusCommentsOnOpen] = useState(false);
  const [commentsSheetPostId, setCommentsSheetPostId] = useState<string | null>(null);
  const [sheetCommentDraft, setSheetCommentDraft] = useState("");
  const [feedTick, setFeedTick] = useState(0);
  const headerRef = useRef<HTMLDivElement>(null);
  const loadMoreBusyRef = useRef(false);
  const closeStory = useCallback(() => setStoryOpen(null), []);
  const openProfileFromStory = useCallback((id: string) => {
    try { sessionStorage.setItem("retweet_return_story_user_id", storyOpen?.userId || ""); } catch { /* ignore */ }
    onOpenProfile(id);
  }, [onOpenProfile, storyOpen?.userId]);
  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent<{ userId?: string; storyId?: string }>).detail;
      const id = d?.userId;
      if (id) setStoryOpen({ userId: id, storyId: d?.storyId });
    };
    window.addEventListener("retweet-open-story", handler);
    return () => window.removeEventListener("retweet-open-story", handler);
  }, []);

  useEffect(() => {
    const onOpenPost = (e: Event) => {
      const postId = (e as CustomEvent<{ postId: string }>).detail?.postId;
      if (postId) setOpenPostId(postId);
    };
    window.addEventListener("retweet-open-post-id", onOpenPost);
    return () => window.removeEventListener("retweet-open-post-id", onOpenPost);
  }, []);

  const restoreConsumedRef = useRef(false);
  useEffect(() => {
    if (!restoreFromProfileContext) restoreConsumedRef.current = false;
  }, [restoreFromProfileContext]);

  useLayoutEffect(() => {
    if (!restoreFromProfileContext || restoreFromProfileContext.tab !== "home") return;
    if (restoreConsumedRef.current) return;
    restoreConsumedRef.current = true;
    const d = restoreFromProfileContext;
    onConsumedRestoreFromProfile?.();
    if (!d.postId || !d.homeSurface) return;
    const p = posts.find(x => x.id === d.postId);
    if (!p) return;
    const surface = d.homeSurface;
    if (surface === "feed_comments_sheet") {
      setCommentsSheetPostId(d.postId);
      setOpenPostId(null);
      setFocusCommentsOnOpen(false);
    } else {
      setCommentsSheetPostId(null);
      setFocusCommentsOnOpen(!!d.commentsOpen);
      setOpenPostId(d.postId);
    }
  }, [restoreFromProfileContext, posts, onConsumedRestoreFromProfile]);

  const openPost = useMemo(
    () => (openPostId ? posts.find(p => p.id === openPostId) ?? null : null),
    [openPostId, posts],
  );

  useEffect(() => {
    if (!commentsSheetPostId) setSheetCommentDraft("");
  }, [commentsSheetPostId]);

  const commentsSheetPost = useMemo(
    () => (commentsSheetPostId ? posts.find(po => po.id === commentsSheetPostId) ?? null : null),
    [posts, commentsSheetPostId],
  );

  const handleStoryCreate = useCallback(() => {
    if (isGuest) {
      notifyGuestActionBlocked();
      return;
    }
    requestOpenStoryGallery();
  }, [isGuest]);

  const goToReelsTab = useCallback(() => {
    window.dispatchEvent(new CustomEvent("retweet-go-reels"));
  }, []);

  const tabScrollRef = useTabPanelScrollRef();
  const pullHintTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (pullHintTimerRef.current != null) window.clearTimeout(pullHintTimerRef.current);
    };
  }, []);

  const refreshFeedBg = useCallback(async () => {
    await refreshFeedFromServer();
    setFeedTick(t => t + 1);
  }, [refreshFeedFromServer]);

  const { pullPx, refreshing: pullRefreshing, runRefresh } = useHomePullToRefresh(
    tabScrollRef,
    refreshFeedBg,
    isHomeTabActive && !isGuest,
  );

  const onPullRefreshDone = useCallback(() => {
    setRefreshDoneHint(true);
    tabScrollRef?.current?.scrollTo({ top: 0, behavior: "smooth" });
    if (pullHintTimerRef.current != null) window.clearTimeout(pullHintTimerRef.current);
    pullHintTimerRef.current = window.setTimeout(() => {
      pullHintTimerRef.current = null;
      setRefreshDoneHint(false);
    }, 1600);
  }, [tabScrollRef]);

  const pullRefreshingRef = useRef(false);
  useEffect(() => {
    if (pullRefreshing && !pullRefreshingRef.current) {
      pullRefreshingRef.current = true;
      return;
    }
    if (!pullRefreshing && pullRefreshingRef.current) {
      pullRefreshingRef.current = false;
      onPullRefreshDone();
    }
  }, [pullRefreshing, onPullRefreshDone]);

  const feedTickRef = useRef(feedTick);
  feedTickRef.current = feedTick;

  const storyFriends = useAppSelector(
    s => {
      void feedTickRef.current;
      const meId = s.currentUserId;
      if (!meId) return [] as string[];
      return visibleStoryFriendsUserIds(s, meId);
    },
    equalIdArrays,
  );

  const storyTrayRing = useAppSelector(
    s => {
      void feedTickRef.current;
      const meId = s.currentUserId;
      if (!meId) return [] as string[];
      return storyViewerTrayRing(s, meId);
    },
    equalIdArrays,
  );

  const openPostById = useCallback((postId: string) => {
    setFocusCommentsOnOpen(false);
    setCommentsSheetPostId(null);
    setOpenPostId(postId);
  }, []);

  const openCommentsById = useCallback((postId: string) => {
    setCommentsSheetPostId(postId);
  }, []);

  const feedActions = useMemo(
    () => ({
      onShare: setShareTarget,
      onOpenProfile,
      onOpenChat,
      openPost: openPostById,
      openCommentsSheet: openCommentsById,
    }),
    [onOpenProfile, onOpenChat, openPostById, openCommentsById],
  );

  const handleLoadMore = useCallback(() => {
    if (loadMoreBusyRef.current || !feedHasMore) return;
    loadMoreBusyRef.current = true;
    void loadMoreFeedFromServer().finally(() => {
      loadMoreBusyRef.current = false;
    });
  }, [feedHasMore, loadMoreFeedFromServer]);

  const lastHomeFeedPullRef = useRef(0);
  useEffect(() => {
    if (!isHomeTabActive || isGuest) return;
    const now = Date.now();
    const minGap = nativeShell ? 900 : 1200;
    if (now - lastHomeFeedPullRef.current < minGap && feed.length > 0) return;
    lastHomeFeedPullRef.current = now;
    const delayMs = nativeShell && isNativePostLoginQuietPeriod() ? 250 : 0;
    const t = window.setTimeout(() => void runRefresh(), delayMs);
    return () => window.clearTimeout(t);
  }, [isHomeTabActive, isGuest, runRefresh, nativeShell]);

  useEffect(() => {
    if (!isHomeTabActive || isGuest) return;
    const onNewPost = () => {
      setFeedTick(t => t + 1);
      tabScrollRef?.current?.scrollTo({ top: 0, behavior: "smooth" });
    };
    window.addEventListener(NEW_FEED_POST_EVENT, onNewPost);
    return () => window.removeEventListener(NEW_FEED_POST_EVENT, onNewPost);
  }, [isHomeTabActive, isGuest, tabScrollRef]);

  useEffect(() => {
    if (!isHomeTabActive || isGuest) return;
    const poll = window.setInterval(() => {
      if (document.visibilityState === "visible") void runRefresh();
    }, 22_000);
    let visTimer = 0;
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      if (visTimer) window.clearTimeout(visTimer);
      visTimer = window.setTimeout(() => void runRefresh(), 400);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(poll);
      if (visTimer) window.clearTimeout(visTimer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [isHomeTabActive, isGuest, runRefresh]);

  useEffect(() => {
    if (!nativeShell || !isHomeTabActive || isGuest) return;
    const el = tabScrollRef?.current;
    if (!el) return;
    const onScroll = () => {
      if (!feedHasMore) return;
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 900;
      if (nearBottom) handleLoadMore();
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [nativeShell, isHomeTabActive, isGuest, tabScrollRef, feedHasMore, handleLoadMore]);

  return (
    <div
      className={
        "relative flex min-h-0 flex-1 flex-col bg-background " +
        (nativeShell ? "w-full max-w-none" : "")
      }
    >
    <div
      className={
        "flex min-h-full flex-col bg-background pb-2 " +
        (openPost ? "pointer-events-none select-none" : "")
      }
      aria-hidden={openPost ? true : undefined}
    >
      <div ref={headerRef} className="shrink-0">
      <HomePullToRefreshIndicator pullPx={pullPx} refreshing={pullRefreshing} />
      {refreshDoneHint && !pullRefreshing && (
        <div className="mx-3 mt-0.5 shrink-0 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-center text-xs py-1.5 px-3 font-medium">
          تم التحديث — أحدث التغريدات
        </div>
      )}
      <StoriesRow
        userIds={storyFriends}
        onOpenStory={setStoryOpen}
        onCreateStory={handleStoryCreate}
      />

      {/* Home/Reels switcher under stories */}
      <div className="px-3 py-2">
        <div className="grid grid-cols-2 rounded-full border border-border bg-card p-1">
          <button
            type="button"
            className="rounded-full bg-background px-3 py-1.5 text-sm font-semibold text-foreground shadow-sm"
            aria-label="الرئيسية"
          >
            الرئيسية
          </button>
          <button
            type="button"
            onClick={goToReelsTab}
            className="flex items-center justify-center gap-1 rounded-full px-3 py-1.5 text-sm font-semibold text-muted-foreground hover:bg-background/80 hover:text-foreground"
            aria-label="ريلز"
          >
            <PlaySquare size={14} />
            ريلز
          </button>
        </div>
      </div>
      </div>

      <section aria-label="الخلاصة" className="relative z-0 flex flex-col bg-background">
        <VirtualizedHomeFeed
          posts={feed}
          scrollRef={tabScrollRef}
          headerOffsetPx={0}
          feedHasMore={feedHasMore}
          onLoadMore={handleLoadMore}
          feedActions={feedActions}
        />
        {feed.length === 0 && !pullRefreshing && (
          <p className="text-center text-muted-foreground py-12">{t("noPosts")}</p>
        )}
        {feed.length === 0 && pullRefreshing && (
          <div className="flex flex-col items-center gap-3 py-14">
            <div className="retweet-ios-pull-spinner h-8 w-8 rounded-full border-[2.5px] border-muted-foreground/20 border-t-primary" />
            <p className="text-sm text-muted-foreground">جاري تحميل الخلاصة…</p>
          </div>
        )}
      </section>

      {shareTarget && <ShareSheet target={{ kind: "post", post: shareTarget }} onClose={() => setShareTarget(null)} />}
      {commentsSheetPost && (
        (() => {
          const sheetComments = (Array.isArray(commentsSheetPost.comments)
            ? commentsSheetPost.comments
            : []
          )
            .filter((c): c is { id: string; userId: string; text: string; createdAt: number } => {
              if (!c || typeof c !== "object") return false;
              const row = c as Partial<{ id: unknown; userId: unknown; text: unknown; createdAt: unknown }>;
              return (
                typeof row.id === "string" &&
                row.id.trim().length > 0 &&
                typeof row.userId === "string" &&
                row.userId.trim().length > 0 &&
                typeof row.text === "string"
              );
            })
            .map(c => ({
              id: c.id,
              userId: c.userId,
              text: c.text,
              createdAt: typeof c.createdAt === "number" ? c.createdAt : Date.now(),
            }));
          return (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-end" onClick={() => setCommentsSheetPostId(null)}>
          <div
            className={
              "flex w-full flex-col rounded-t-3xl border-t border-border bg-background text-foreground shadow-2xl " +
              (nativeShell ? "" : "mx-auto max-w-md")
            }
            style={{ height: "min(72vh, 640px)", maxHeight: "72vh" }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-border p-3">
              <span className="text-sm font-semibold">التعليقات ({sheetComments.length})</span>
              <button type="button" onClick={() => setCommentsSheetPostId(null)} aria-label="إغلاق">
                <X size={22} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3 space-y-2">
              {sheetComments.map(c => {
                const cu = users.find(u => u.id === c.userId);
                return (
                  <div key={c.id} className="relative flex gap-2 text-sm">
                    <button
                      type="button"
                      className="shrink-0"
                      onClick={() =>
                        cu &&
                        onOpenProfile(cu.id, {
                          postId: commentsSheetPost.id,
                          tab: "home",
                          commentsOpen: true,
                          homeSurface: "feed_comments_sheet",
                        })
                      }
                    >
                      <Avatar name={cu?.username || "?"} src={cu?.avatar} size={32} />
                    </button>
                    <div>
                      <button
                        type="button"
                        className="font-semibold"
                        onClick={() =>
                          cu &&
                          onOpenProfile(cu.id, {
                            postId: commentsSheetPost.id,
                            tab: "home",
                            commentsOpen: true,
                            homeSurface: "feed_comments_sheet",
                          })
                        }
                      >
                        @{cu?.username}
                      </button>{" "}
                      <span>{c.text}</span>
                    </div>
                    {currentUser && c.userId === currentUser.id && (
                      <button
                        type="button"
                        onClick={() => {
                          if (!window.confirm("حذف هذا التعليق؟")) return;
                          deleteComment(commentsSheetPost.id, c.id);
                        }}
                        className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        aria-label="حذف التعليق"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                );
              })}
              {sheetComments.length === 0 && (
                <p className="text-center text-muted-foreground text-sm py-6">لا تعليقات بعد</p>
              )}
            </div>
            <form
              className="p-3 border-t border-border flex gap-2 shrink-0"
              onSubmit={e => {
                e.preventDefault();
                if (!sheetCommentDraft.trim()) return;
                addComment(commentsSheetPost.id, sheetCommentDraft);
                setSheetCommentDraft("");
              }}
            >
              <input
                value={sheetCommentDraft}
                onChange={e => setSheetCommentDraft(e.target.value)}
                placeholder="أضف تعليقاً..."
                className="flex-1 bg-input rounded-full px-4 py-2 text-sm outline-none"
              />
              <button type="submit" className="text-primary font-semibold text-sm px-2">
                إرسال
              </button>
            </form>
          </div>
        </div>
          );
        })()
      )}
      {storyOpen && (
        <StoryViewer
          userId={storyOpen.userId}
          trayRing={storyTrayRing}
          initialStoryId={storyOpen.storyId}
          openOrigin={storyOpen.origin}
          onRequestAuthor={id => (id ? setStoryOpen({ userId: id }) : closeStory())}
          onClose={closeStory}
          onOpenProfile={openProfileFromStory}
          onOpenChat={onOpenChat}
        />
      )}
    </div>

    {openPost && (
      <PostDetail
        post={openPost}
        onBack={() => {
          setOpenPostId(null);
          setFocusCommentsOnOpen(false);
        }}
        onOpenProfile={onOpenProfile}
        onOpenChat={onOpenChat}
        profileReturnTab="home"
        initialFocusComments={focusCommentsOnOpen}
      />
    )}

    </div>
  );
});
