import { memo, useState, startTransition, useMemo } from "react";
import { LazyInView } from "./LazyInView";
import { postFeedSignature } from "@/lib/postFeedSignature";
import { postShowsFeedMedia } from "@/lib/postMedia";
import { PostOptionsMenu } from "./PostOptionsMenu";
import { useApp, userById, visibleMediaNotes, isMutual } from "@/lib/store";
import { notifyGuestActionBlocked } from "@/lib/guestBlocked";
import { formatRelativeTime } from "@/lib/formatRelativeTime";
import type { MediaNote, Post, ProfileReturnContext } from "@/lib/types";
import { Avatar } from "./Avatar";
import { NoteReplySheet } from "./NoteReplySheet";
import { renderMentionHashtagNodes, createMentionRenderer } from "@/lib/renderMentionHashtagText";
import { normalizePostMedia, resolvePostDisplayType } from "@/lib/postMedia";
import {
  FeedPostColumnShell,
  PostFeedActions,
  PostFeedCaption,
  ProfilePostMetaRow,
  PostFeedMediaBlock,
} from "./PostFeedLayout";

interface Props {
  post: Post;
  onShare: (post: Post) => void;
  onOpenProfile: (userId: string, ctx?: ProfileReturnContext) => void;
  profileReturnTab?: ProfileReturnContext["tab"];
  onOpen: () => void;
  onOpenCommentsSheet?: () => void;
  hideQuickComment?: boolean;
  onOpenChat?: (chatId: string) => void;
}

function PostCardInner({
  post,
  onShare,
  onOpenProfile,
  onOpen,
  onOpenCommentsSheet,
  hideQuickComment,
  onOpenChat,
  profileReturnTab,
}: Props) {
  const { state, currentUser, toggleLike, toggleRepost, addComment, isGuest } = useApp();
  const [noteToReply, setNoteToReply] = useState<MediaNote | null>(null);
  const lang = state.language;
  const author = userById(state, post.userId);
  const postMedia = useMemo(
    () => normalizePostMedia(post),
    [post.image, post.video, post.audio, post.type],
  );
  const displayType = useMemo(
    () => resolvePostDisplayType(post),
    [post.type, post.image, post.video, post.text],
  );
  const [comment, setComment] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const postLikes = Array.isArray(post.likes) ? post.likes : [];
  const postComments = Array.isArray(post.comments) ? post.comments : [];
  const postReposts = Array.isArray(post.reposts) ? post.reposts : [];
  const guestBlock = () => {
    if (!isGuest) return false;
    notifyGuestActionBlocked();
    return true;
  };
  const liked = currentUser ? postLikes.includes(currentUser.id) : false;
  const reposted = currentUser ? postReposts.includes(currentUser.id) : false;
  const feedNotesRaw = currentUser ? visibleMediaNotes(state, "post", post.id, currentUser.id).slice(0, 5) : [];
  const feedNotes = feedNotesRaw.filter(n => {
    const nu = userById(state, n.authorId);
    return nu && (n.authorId === currentUser!.id || isMutual(state, currentUser!.id, n.authorId));
  });
  if (!author) return null;

  const openAuthorProfile = (userId: string) => {
    const ctx: ProfileReturnContext | undefined = profileReturnTab ? { tab: profileReturnTab } : undefined;
    startTransition(() => onOpenProfile(userId, ctx));
  };

  const postKindAr = post.type === "tweet" ? "التغريدة" : post.type === "reel" ? "الريلز" : "المنشور";

  const renderedPostText = useMemo(() => {
    if (!post.text) return null;
    return renderMentionHashtagNodes(post.text, {
      renderMention: createMentionRenderer({
        users: state.users,
        onUserClick: userId => startTransition(() => openAuthorProfile(userId)),
      }),
      renderHashtag: (h, key) => (
        <span key={key} className="text-primary">
          {h}
        </span>
      ),
    });
  }, [post.text, state.users]);

  const notesOverlay =
    feedNotes.length > 0 ? (
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex gap-2 overflow-x-auto bg-gradient-to-b from-black/55 via-black/25 to-transparent px-2.5 pb-8 pt-2.5">
        {feedNotes.map(n => {
          const nu = userById(state, n.authorId)!;
          const canReplyNote = !!onOpenChat && n.authorId !== currentUser!.id;
          return (
            <div key={n.id} className="pointer-events-auto flex max-w-[7.5rem] shrink-0 flex-col items-start gap-1">
              {canReplyNote ? (
                <button
                  type="button"
                  title="رد في الخاص"
                  onClick={e => {
                    e.stopPropagation();
                    if (guestBlock()) return;
                    setNoteToReply(n);
                  }}
                  className="line-clamp-2 w-full rounded-xl border border-white/25 bg-black/45 px-2 py-1 text-start text-[11px] font-medium leading-snug text-white backdrop-blur-sm hover:bg-black/55 active:scale-[0.98]"
                >
                  {n.text}
                </button>
              ) : (
                <div className="line-clamp-2 w-full rounded-xl border border-white/25 bg-black/45 px-2 py-1 text-start text-[11px] font-medium leading-snug text-white backdrop-blur-sm">
                  {n.text}
                </div>
              )}
              <button
                type="button"
                className="pointer-events-auto"
                onClick={e => {
                  e.stopPropagation();
                  openAuthorProfile(nu.id);
                }}
              >
                <Avatar name={nu.username} src={nu.avatar} size={26} />
              </button>
            </div>
          );
        })}
      </div>
    ) : null;

  const showFeedMedia = postShowsFeedMedia({ ...post, type: displayType });
  const isAudioOnlyMedia =
    postMedia.hasAudio && !postMedia.hasImage && !postMedia.hasVideo;
  const mediaLazyMinH =
    postMedia.hasVideo || displayType === "reel" ? "min-h-[12rem]" : "min-h-[12rem]";

  const mediaBlock = (
    <PostFeedMediaBlock
      post={{ ...post, type: displayType }}
      postMedia={postMedia}
      notesOverlay={notesOverlay}
      onOpen={onOpen}
      profileInset
    />
  );

  return (
    <article className="feed-post-card border-b border-border">
      <FeedPostColumnShell author={author} onOpenAuthor={() => openAuthorProfile(author.id)}>
        <ProfilePostMetaRow
          author={author}
          timeLabel={formatRelativeTime(post.createdAt, lang)}
          onOpenAuthor={() => openAuthorProfile(author.id)}
          onOpenPost={onOpen}
          onMenu={currentUser?.id === post.userId ? () => setMenuOpen(v => !v) : undefined}
        />
        {menuOpen && <PostOptionsMenu post={post} onClose={() => setMenuOpen(false)} />}

        {renderedPostText && (
          <PostFeedCaption
            variant={displayType === "tweet" ? "tweet" : "post"}
            onClick={onOpen}
            profileInset
          >
            {renderedPostText}
          </PostFeedCaption>
        )}

        {showFeedMedia && !isAudioOnlyMedia ? (
          <LazyInView minHeight={mediaLazyMinH} rootMargin="320px 0px">
            {mediaBlock}
          </LazyInView>
        ) : showFeedMedia ? (
          mediaBlock
        ) : null}

        <PostFeedActions
          liked={liked}
          reposted={reposted}
          likeCount={postLikes.length}
          commentCount={postComments.length}
          repostCount={postReposts.length}
          onLike={() => {
            if (guestBlock()) return;
            startTransition(() => toggleLike(post.id));
          }}
          onComment={() => startTransition(() => (onOpenCommentsSheet ?? onOpen)())}
          onRepost={() => {
            if (guestBlock()) return;
            startTransition(() => toggleRepost(post.id));
          }}
          onShare={() => {
            if (guestBlock()) return;
            onShare(post);
          }}
          profileInset
        />

        {!hideQuickComment && (
          <form
            onSubmit={e => {
              e.preventDefault();
              if (guestBlock()) return;
              if (comment.trim()) {
                addComment(post.id, comment);
                setComment("");
              }
            }}
            dir="rtl"
            className="flex flex-row gap-2 px-0 pt-2"
          >
            <input
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="تعليق سريع..."
              className="flex-1 rounded-full bg-input px-4 py-2 text-sm outline-none"
            />
            {comment && (
              <button type="submit" className="text-sm font-semibold text-primary">
                نشر
              </button>
            )}
          </form>
        )}
      </FeedPostColumnShell>

      <NoteReplySheet
        note={noteToReply}
        contentLabelAr={postKindAr}
        onClose={() => setNoteToReply(null)}
        onSent={chatId => onOpenChat?.(chatId)}
      />
    </article>
  );
}

export const PostCard = memo(
  PostCardInner,
  (prev, next) =>
    postFeedSignature(prev.post) === postFeedSignature(next.post) &&
    prev.hideQuickComment === next.hideQuickComment &&
    prev.profileReturnTab === next.profileReturnTab,
);
