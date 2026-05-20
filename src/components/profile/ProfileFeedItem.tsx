import { useMemo, useState, startTransition } from "react";
import { PostOptionsMenu } from "../PostOptionsMenu";
import { useApp, userById, visibleMediaNotes, isMutual } from "@/lib/store";
import { formatRelativeTime } from "@/lib/formatRelativeTime";
import { useT } from "@/lib/i18n";
import { Avatar } from "../Avatar";
import { ShareSheet } from "../ShareSheet";
import { AtSign, Repeat2 } from "lucide-react";
import {
  PostFeedActions,
  PostFeedCaption,
  PostFeedHeader,
  PostFeedMediaBlock,
} from "../PostFeedLayout";
import { ProfileTweetCard } from "./ProfileTweetCard";
import type { MediaNote, Post, ProfileGridTab, ProfileReturnContext } from "@/lib/types";
import { NoteReplySheet } from "../NoteReplySheet";
import { isDisplayTweet, normalizePostMedia, resolvePostDisplayType } from "@/lib/postMedia";
import { renderMentionHashtagNodes } from "@/lib/renderMentionHashtagText";

export function sortProfilePostsNewestFirst(posts: Post[]): Post[] {
  return posts.slice().sort((a, b) => b.createdAt - a.createdAt);
}

function ProfileRepostBadge() {
  return (
    <div className="flex items-center gap-1.5 border-b border-border/50 px-3 py-1.5 text-xs font-medium text-muted-foreground">
      <Repeat2 size={14} className="shrink-0" />
      <span>إعادة نشر</span>
    </div>
  );
}

export function ProfileFeedItem({
  post,
  profileOwnerId,
  gridTab,
  onOpenProfile,
  onOpenChat,
  showRepostBadge = false,
}: {
  post: Post;
  profileOwnerId: string;
  gridTab: ProfileGridTab;
  onOpenProfile: (id: string, ctx?: ProfileReturnContext) => void;
  onOpenChat: (chatId: string) => void;
  showRepostBadge?: boolean;
}) {
  const { state, currentUser, toggleLike, toggleRepost, addComment } = useApp();
  const [noteToReply, setNoteToReply] = useState<MediaNote | null>(null);
  const [comment, setComment] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const lang = state.language;
  const t = useT();
  const me = currentUser!;
  const author = userById(state, post.userId);
  const liked = post.likes.includes(me.id);
  const reposted = post.reposts.includes(me.id);
  const postKindAr = post.type === "tweet" ? "التغريدة" : post.type === "reel" ? "الريلز" : "المنشور";
  const displayType = useMemo(
    () => resolvePostDisplayType(post),
    [post.type, post.image, post.video, post.text],
  );
  const isTweet = isDisplayTweet(post);
  const postMedia = useMemo(() => normalizePostMedia(post), [post.image, post.video, post.type]);

  const returnCtx = (commentsOpenCtx?: boolean): ProfileReturnContext => ({
    postId: post.id,
    tab: "profile",
    commentsOpen: !!commentsOpenCtx,
    profileUserId: profileOwnerId,
    profileGridTab: gridTab,
  });

  const renderedPostText = useMemo(() => {
    if (!post.text) return null;
    return renderMentionHashtagNodes(post.text, {
      renderMention: (uname, key) => {
        const u = state.users.find(x => x.username === uname);
        if (u) {
          return (
            <button
              key={key}
              type="button"
              onClick={() => startTransition(() => onOpenProfile(u.id, returnCtx(false)))}
              className="text-primary"
            >
              <AtSign size={12} className="inline" />
              {uname}
            </button>
          );
        }
        return (
          <span key={key} className="text-primary">
            @{uname}
          </span>
        );
      },
      renderHashtag: (h, key) => (
        <span key={key} className="text-primary">
          {h}
        </span>
      ),
    });
  }, [post.text, state.users, onOpenProfile]);

  if (!author) return null;

  if (isTweet) {
    return (
      <div>
        {showRepostBadge && <ProfileRepostBadge />}
        <div className="relative">
          <ProfileTweetCard
            post={post}
            author={author}
            lang={lang}
            liked={liked}
            reposted={reposted}
            users={state.users}
            onOpenAuthor={() => startTransition(() => onOpenProfile(author.id, returnCtx(false)))}
            onOpenProfile={id => startTransition(() => onOpenProfile(id, returnCtx(false)))}
            onLike={() => startTransition(() => toggleLike(post.id))}
            onRepost={() => startTransition(() => toggleRepost(post.id))}
            onAddComment={text => addComment(post.id, text)}
            onMenu={me.id === post.userId ? () => setMenuOpen(v => !v) : undefined}
            commentsAnchorId={`profile-feed-comments-${post.id}`}
          />
          {menuOpen && <PostOptionsMenu post={post} onClose={() => setMenuOpen(false)} />}
        </div>
      </div>
    );
  }

  const detailNotes = visibleMediaNotes(state, "post", post.id, me.id).slice(0, 8).filter(n => {
    const nu = userById(state, n.authorId);
    return nu && (n.authorId === me.id || isMutual(state, me.id, n.authorId));
  });

  return (
    <article dir="rtl" className="border-b border-border/80 text-right">
      {showRepostBadge && <ProfileRepostBadge />}
      {detailNotes.length > 0 && (
        <div className="flex gap-2 overflow-x-auto border-b border-border/60 px-4 pb-2 pt-2 no-scrollbar">
          {detailNotes.map(n => {
            const nu = userById(state, n.authorId)!;
            const canReplyNote = n.authorId !== me.id;
            return (
              <div key={n.id} className="flex max-w-[4rem] shrink-0 flex-col items-center">
                {canReplyNote ? (
                  <button
                    type="button"
                    title="رد في الخاص"
                    onClick={() => setNoteToReply(n)}
                    className="mb-0.5 line-clamp-3 rounded-lg border border-border bg-secondary px-1.5 py-0.5 text-start text-[9px] leading-tight hover:bg-secondary/80"
                  >
                    {n.text}
                  </button>
                ) : (
                  <div className="mb-0.5 line-clamp-3 rounded-lg border border-border bg-secondary px-1.5 py-0.5 text-start text-[9px] leading-tight">
                    {n.text}
                  </div>
                )}
                <button type="button" onClick={() => startTransition(() => onOpenProfile(nu.id, returnCtx(false)))}>
                  <Avatar name={nu.username} src={nu.avatar} size={28} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="relative">
        <PostFeedHeader
          author={author}
          timeLabel={formatRelativeTime(post.createdAt, lang)}
          onOpenAuthor={() => startTransition(() => onOpenProfile(author.id, returnCtx(false)))}
          onMenu={me.id === post.userId ? () => setMenuOpen(v => !v) : undefined}
        />
        {menuOpen && <PostOptionsMenu post={post} onClose={() => setMenuOpen(false)} />}
      </div>

      {renderedPostText && <PostFeedCaption>{renderedPostText}</PostFeedCaption>}

      <PostFeedMediaBlock post={{ ...post, type: displayType }} postMedia={postMedia} />

      <PostFeedActions
        liked={liked}
        reposted={reposted}
        likeCount={post.likes.length}
        commentCount={post.comments.length}
        repostCount={post.reposts.length}
        onLike={() => startTransition(() => toggleLike(post.id))}
        onComment={() => setCommentsOpen(o => !o)}
        onRepost={() => startTransition(() => toggleRepost(post.id))}
        onShare={() => setShareOpen(true)}
      />

      {commentsOpen && (
        <div
          id={`profile-feed-comments-${post.id}`}
          className="space-y-2 border-t border-border/60 px-4 pb-4 pt-3 scroll-mt-24"
        >
          <h3 className="text-sm font-semibold">{t("comments")}</h3>
          {post.comments.map(c => {
            const u = userById(state, c.userId);
            return (
              <div key={c.id} className="flex gap-2 text-sm">
                <button
                  type="button"
                  className="shrink-0 rounded-full"
                  onClick={() => startTransition(() => u && onOpenProfile(u.id, returnCtx(true)))}
                >
                  <Avatar name={u?.username || "?"} src={u?.avatar} size={28} />
                </button>
                <div className="min-w-0">
                  <button
                    type="button"
                    className="font-semibold"
                    onClick={() => startTransition(() => u && onOpenProfile(u.id, returnCtx(true)))}
                  >
                    @{u?.username}
                  </button>{" "}
                  <span className="[overflow-wrap:break-word]">{c.text}</span>
                </div>
              </div>
            );
          })}
          {post.comments.length === 0 && <p className="text-xs text-muted-foreground">—</p>}
          <form
            onSubmit={e => {
              e.preventDefault();
              if (comment.trim()) {
                addComment(post.id, comment);
                setComment("");
              }
            }}
            className="flex gap-2 pt-1"
          >
            <input
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder={t("send")}
              className="flex-1 rounded-full bg-input px-4 py-2 text-sm outline-none"
            />
            {comment.trim() && (
              <button type="submit" className="shrink-0 text-sm font-semibold text-primary">
                {t("send")}
              </button>
            )}
          </form>
        </div>
      )}

      {shareOpen && <ShareSheet target={{ kind: "post", post }} onClose={() => setShareOpen(false)} />}

      <NoteReplySheet note={noteToReply} contentLabelAr={postKindAr} onClose={() => setNoteToReply(null)} onSent={onOpenChat} />
    </article>
  );
}
