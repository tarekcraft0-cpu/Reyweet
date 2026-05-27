import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { HomeFeedPostItem } from "../home/HomeFeedPostItem";
import { HomeFeedActionsProvider } from "@/lib/homeFeedActionsContext";
import { useTabPanelScrollRef } from "@/lib/tabPanelScrollContext";
import { useApp, userById, visibleStoryFriendsUserIds } from "@/lib/store";
import { storyViewerTrayRing } from "@/lib/storyTray";
import { isReelFeedPost } from "@/lib/postMedia";
import { notifyGuestActionBlocked } from "@/lib/guestBlocked";
import { stashPendingStoryFile } from "@/lib/storyMedia";
import { useT } from "@/lib/i18n";
import { PostDetail } from "../PostDetail";
import { StoryViewer } from "../StoryViewer";
import { StoriesRow, type StoryOpenRequest } from "../stories/StoriesRow";
import { ShareSheet } from "../ShareSheet";
import type { Post, ProfileReturnContext } from "@/lib/types";
import { X, Trash2 } from "lucide-react";

interface Props {
  onOpenProfile: (id: string, ctx?: ProfileReturnContext) => void;
  onOpenChat: (chatId: string) => void;
  /** يُمرَّر من App بعد الرجوع من بروفايل فتح منشور/تعليقات */
  restoreFromProfileContext?: ProfileReturnContext | null;
  onConsumedRestoreFromProfile?: () => void;
}

export function HomeScreen({
  onOpenProfile,
  onOpenChat,
  restoreFromProfileContext = null,
  onConsumedRestoreFromProfile,
}: Props) {
  const { state, currentUser, addComment, deleteComment, isGuest } = useApp();
  const t = useT();
  const [shareTarget, setShareTarget] = useState<Post | null>(null);
  const [storyOpen, setStoryOpen] = useState<StoryOpenRequest | null>(null);
  const [openPostId, setOpenPostId] = useState<string | null>(null);
  const [focusCommentsOnOpen, setFocusCommentsOnOpen] = useState(false);
  const [commentsSheetPostId, setCommentsSheetPostId] = useState<string | null>(null);
  const [sheetCommentDraft, setSheetCommentDraft] = useState("");
  const [showStoryCreate, setShowStoryCreate] = useState(false);
  const [feedTick, setFeedTick] = useState(0);
  const [pullHint, setPullHint] = useState(false);
  const touchRef = useRef({ y0: 0, active: false });
  const me = currentUser!;
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
  
  useLayoutEffect(() => {
    if (!restoreFromProfileContext || restoreFromProfileContext.tab !== "home") return;
    const d = restoreFromProfileContext;
    onConsumedRestoreFromProfile?.();
    if (!d.postId || !d.homeSurface) return;
    const p = state.posts.find(x => x.id === d.postId);
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
  }, [restoreFromProfileContext, state.posts, onConsumedRestoreFromProfile]);

  const openPost = useMemo(
    () => (openPostId ? state.posts.find(p => p.id === openPostId) ?? null : null),
    [openPostId, state.posts],
  );

  useEffect(() => {
    if (!commentsSheetPostId) setSheetCommentDraft("");
  }, [commentsSheetPostId]);

  const commentsSheetPost = useMemo(
    () => (commentsSheetPostId ? state.posts.find(po => po.id === commentsSheetPostId) ?? null : null),
    [state.posts, commentsSheetPostId],
  );

  const handleStoryCreate = () => {
    if (isGuest) {
      notifyGuestActionBlocked();
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,video/*';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      stashPendingStoryFile(file);
      window.dispatchEvent(
        new CustomEvent("retweet-open-create", {
          detail: { type: "story" },
        }),
      );
    };
    input.click();
  };

  const tabScrollRef = useTabPanelScrollRef();

  useEffect(() => {
    const scrollTop = () => tabScrollRef?.current?.scrollTop ?? 0;
    const onStart = (e: TouchEvent) => {
      touchRef.current = { y0: e.touches[0].clientY, active: scrollTop() <= 2 };
    };
    const onEnd = (e: TouchEvent) => {
      if (!touchRef.current.active) return;
      touchRef.current.active = false;
      const y = e.changedTouches[0]?.clientY ?? touchRef.current.y0;
      const dy = y - touchRef.current.y0;
      if (scrollTop() <= 2 && dy > 72) {
        setFeedTick(t => t + 1);
        setPullHint(true);
        window.setTimeout(() => setPullHint(false), 1400);
      }
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchend", onEnd);
    };
  }, [tabScrollRef]);

  const storyFriends = useMemo(
    () => visibleStoryFriendsUserIds(state, me.id),
    [state.stories, state.users, me.id, me.following, feedTick],
  );

  const storyTrayRing = useMemo(
    () => storyViewerTrayRing(state, me.id),
    [state.stories, me.id, feedTick],
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

  const feed = useMemo(() => {
    const seen = new Set<string>();
    return (state.posts ?? [])
      .filter(p => {
        if (!p?.id || seen.has(p.id) || isReelFeedPost(p)) return false;
        seen.add(p.id);
        const author = userById(state, p.userId);
        if (!author) return true;
        const authorBlocked = author.blocked ?? [];
        const myBlocked = me.blocked ?? [];
        const authorFollowers = author.followers ?? [];
        if (authorBlocked.includes(me.id)) return false;
        if (myBlocked.includes(author.id)) return false;
        if (author.isPrivate && p.userId !== me.id && !authorFollowers.includes(me.id)) return false;
        return true;
      })
      .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  }, [state.posts, state.users, me.id, me.blocked, feedTick]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-background">
    <div
      className={
        "flex min-h-full flex-col bg-background pb-2 " +
        (openPost ? "pointer-events-none select-none" : "")
      }
      aria-hidden={openPost ? true : undefined}
    >
      {pullHint && (
        <div className="mx-3 mt-1 shrink-0 rounded-full bg-primary/90 text-primary-foreground text-center text-xs py-2 px-3 shadow-md">
          تم التحديث — أحدث المنشورات والستوريات
        </div>
      )}
      <StoriesRow
        userIds={storyFriends}
        onOpenStory={setStoryOpen}
        onCreateStory={handleStoryCreate}
      />

      <section aria-label="الخلاصة" className="relative z-0 flex flex-col bg-background">
        <HomeFeedActionsProvider value={feedActions}>
          {feed.map(p => (
            <HomeFeedPostItem key={p.id} post={p} />
          ))}
        </HomeFeedActionsProvider>
        {feed.length === 0 && (
          <p className="text-center text-muted-foreground py-12">{t("noPosts")}</p>
        )}
      </section>

      {shareTarget && <ShareSheet target={{ kind: "post", post: shareTarget }} onClose={() => setShareTarget(null)} />}
      {commentsSheetPost && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-end" onClick={() => setCommentsSheetPostId(null)}>
          <div
            className="mx-auto flex w-full max-w-md flex-col rounded-t-3xl border-t border-border bg-background text-foreground shadow-2xl"
            style={{ height: "min(72vh, 640px)", maxHeight: "72vh" }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-border p-3">
              <span className="text-sm font-semibold">التعليقات ({commentsSheetPost.comments.length})</span>
              <button type="button" onClick={() => setCommentsSheetPostId(null)} aria-label="إغلاق">
                <X size={22} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3 space-y-2">
              {commentsSheetPost.comments.map(c => {
                const cu = userById(state, c.userId);
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
              {commentsSheetPost.comments.length === 0 && (
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
}
