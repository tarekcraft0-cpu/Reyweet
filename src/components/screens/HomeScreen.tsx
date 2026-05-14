import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp, userById, visibleStoryUserIds } from "@/lib/store";
import { notifyGuestActionBlocked } from "@/lib/guestBlocked";
import { useT } from "@/lib/i18n";
import { Avatar } from "../Avatar";
import { PostCard } from "../PostCard";
import { PostDetail } from "../PostDetail";
import { StoryViewer } from "../StoryViewer";
import { ShareSheet } from "../ShareSheet";
import type { Post, ProfileReturnContext } from "@/lib/types";
import { X } from "lucide-react";

interface Props { onOpenProfile: (id: string, ctx?: ProfileReturnContext) => void; onOpenChat: (chatId: string) => void; }

export function HomeScreen({ onOpenProfile, onOpenChat }: Props) {
  const { state, currentUser, addComment, isGuest } = useApp();
  const t = useT();
  const [shareTarget, setShareTarget] = useState<Post | null>(null);
  const [storyUserId, setStoryUserId] = useState<string | null>(null);
  const [openPost, setOpenPost] = useState<Post | null>(null);
  const [focusCommentsOnOpen, setFocusCommentsOnOpen] = useState(false);
  const [commentsSheetPostId, setCommentsSheetPostId] = useState<string | null>(null);
  const [sheetCommentDraft, setSheetCommentDraft] = useState("");
  const [showStoryCreate, setShowStoryCreate] = useState(false);
  const [feedTick, setFeedTick] = useState(0);
  const [pullHint, setPullHint] = useState(false);
  const touchRef = useRef({ y0: 0, active: false });
  const me = currentUser!;
  const closeStory = useCallback(() => setStoryUserId(null), []);
  const openProfileFromStory = useCallback((id: string) => {
    try { sessionStorage.setItem("retweet_return_story_user_id", storyUserId || ""); } catch { /* ignore */ }
    onOpenProfile(id);
  }, [onOpenProfile, storyUserId]);
  useEffect(() => {
    const handler = (e: any) => {
      const id = e?.detail?.userId;
      if (id) setStoryUserId(id);
    };
    window.addEventListener("retweet-open-story", handler);
    return () => window.removeEventListener("retweet-open-story", handler);
  }, []);
  
  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent<ProfileReturnContext>).detail;
      if (!d || d.tab !== "home") return;
      const p = state.posts.find(x => x.id === d.postId);
      if (!p) return;
      const surface = d.homeSurface ?? "post_detail_full";
      if (surface === "feed_comments_sheet") {
        setCommentsSheetPostId(d.postId);
        setOpenPost(null);
        setFocusCommentsOnOpen(false);
      } else {
        setCommentsSheetPostId(null);
        setFocusCommentsOnOpen(!!d.commentsOpen);
        setOpenPost(p);
      }
    };
    window.addEventListener("retweet-restore-post", handler);
    return () => window.removeEventListener("retweet-restore-post", handler);
  }, [state.posts]);

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
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const dataUrl = e.target?.result as string;
          // Navigate to create screen with story type and media
          window.location.hash = '#create?type=story&media=' + encodeURIComponent(dataUrl);
        };
        reader.readAsDataURL(file);
      }
    };
    input.click();
  };

  useEffect(() => {
    const onStart = (e: TouchEvent) => {
      touchRef.current = { y0: e.touches[0].clientY, active: window.scrollY <= 2 };
    };
    const onEnd = (e: TouchEvent) => {
      if (!touchRef.current.active) return;
      touchRef.current.active = false;
      const y = e.changedTouches[0]?.clientY ?? touchRef.current.y0;
      const dy = y - touchRef.current.y0;
      if (window.scrollY <= 2 && dy > 72) {
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
  }, []);

  // story users - نفس ترتيب الشريط
  const storyUsers = useMemo(
    () => visibleStoryUserIds(state, me.id).filter(id => id !== me.id),
    [state.stories, state.users, me.id, feedTick],
  );

  const feed = useMemo(
    () =>
      state.posts
        .filter(p => {
          const author = userById(state, p.userId);
          if (!author) return false;
          if (author.blocked.includes(me.id)) return false;
          if (me.blocked.includes(author.id)) return false;
          if (author.isPrivate && p.userId !== me.id && !author.followers.includes(me.id)) return false;
          return true;
        })
        .sort((a, b) => b.createdAt - a.createdAt),
    [state.posts, state.users, me.id, me.blocked, me.following, feedTick],
  );

  if (openPost)
    return (
      <PostDetail
        post={openPost}
        onBack={() => {
          setOpenPost(null);
          setFocusCommentsOnOpen(false);
        }}
        onOpenProfile={onOpenProfile}
        onOpenChat={onOpenChat}
        profileReturnTab="home"
        initialFocusComments={focusCommentsOnOpen}
      />
    );

  return (
    <div className="pb-2">
      {pullHint && (
        <div className="sticky top-0 z-20 mx-3 mt-1 rounded-full bg-primary/90 text-primary-foreground text-center text-xs py-2 px-3 shadow-md">
          تم التحديث — أحدث المنشورات والستوريات
        </div>
      )}
      <div className="flex gap-3 overflow-x-auto no-scrollbar px-4 py-3 border-b border-border">
        <button
          type="button"
          onClick={handleStoryCreate}
          aria-disabled={isGuest}
          className={
            "flex flex-col items-center gap-1 shrink-0 touch-manipulation " +
            (isGuest ? "cursor-not-allowed opacity-50" : "")
          }
        >
          <div className="relative">
            <Avatar name={me.username} src={me.avatar} size={62} ring={state.stories.some(s => s.userId === me.id)} />
            <div className="absolute -bottom-1 -end-1 bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center text-xs">+</div>
          </div>
          <span className="text-xs">{t("yourStory")}</span>
        </button>
        {storyUsers.filter(id => id !== me.id).map(id => {
          const u = userById(state, id); if (!u) return null;
          return (
            <button key={id} onClick={() => setStoryUserId(id)} className="flex flex-col items-center gap-1 shrink-0">
              <Avatar name={u.username} src={u.avatar} size={62} ring />
              <span className="text-xs max-w-16 truncate">{u.username}</span>
            </button>
          );
        })}
      </div>

      {feed.map(p => (
        <PostCard
          key={p.id}
          post={p}
          onShare={setShareTarget}
          onOpenProfile={onOpenProfile}
          onOpenChat={onOpenChat}
          onOpen={() => {
            setFocusCommentsOnOpen(false);
            setCommentsSheetPostId(null);
            setOpenPost(p);
          }}
          onOpenCommentsSheet={() => setCommentsSheetPostId(p.id)}
          hideQuickComment
        />
      ))}
      {feed.length === 0 && <p className="text-center text-muted-foreground py-12">{t("noPosts")}</p>}

      {shareTarget && <ShareSheet target={{ kind: "post", post: shareTarget }} onClose={() => setShareTarget(null)} />}
      {commentsSheetPost && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-end" onClick={() => setCommentsSheetPostId(null)}>
          <div
            className="bg-background text-foreground w-full max-w-md mx-auto rounded-t-3xl max-h-[70vh] flex flex-col shadow-2xl border-t border-border"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-3 border-b border-border shrink-0">
              <span className="font-semibold text-sm">التعليقات</span>
              <button type="button" onClick={() => setCommentsSheetPostId(null)} aria-label="إغلاق">
                <X size={22} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
              {commentsSheetPost.comments.map(c => {
                const cu = userById(state, c.userId);
                return (
                  <div key={c.id} className="flex gap-2 text-sm">
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
      {storyUserId && (
        <StoryViewer
          userId={storyUserId}
          onRequestAuthor={id => setStoryUserId(id)}
          onClose={closeStory}
          onOpenProfile={openProfileFromStory}
          onOpenChat={onOpenChat}
        />
      )}
    </div>
  );
}
