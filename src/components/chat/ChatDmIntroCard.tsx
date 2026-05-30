import { useMemo } from "react";
import { formatCompactCount } from "@/lib/formatCount";
import { isMutual, theyFollowViewer, userIsFollowing } from "@/lib/store";
import type { AppState, ID, User } from "@/lib/types";
import { Avatar } from "../Avatar";
import { VerifiedMarkForUser } from "../VerifiedBadge";

function mutualConnectionIds(state: AppState, meId: ID, otherId: ID): ID[] {
  const me = state.users.find(u => u.id === meId);
  const other = state.users.find(u => u.id === otherId);
  if (!me || !other) return [];
  const myFollowing = new Set(me.following);
  return other.following.filter(fid => fid !== meId && fid !== otherId && myFollowing.has(fid));
}

type Props = {
  other: User;
  meId: ID;
  state: AppState;
  onOpenProfile: () => void;
  isQuran?: boolean;
  /** هل توجد رسائل في الشات — يخفي سطر «ابدأ المحادثة» لأنه لم يعد مناسباً */
  hasMessages?: boolean;
  /** معاينة السحب وغيرها: لا تعرض سطر «أرسل رسالة لبدء المحادثة» أبداً */
  hideStartConversationHint?: boolean;
};

export function ChatDmIntroCard({ other, meId, state, onOpenProfile, isQuran, hasMessages, hideStartConversationHint }: Props) {
  const postCount = useMemo(
    () => state.posts.filter(p => p.userId === other.id).length,
    [state.posts, other.id],
  );

  const followerCount = other.displayFollowerCount ?? other.followers.length;
  const hideFollowStats = other.hideFollowListsFromOthers && other.id !== meId;
  const mutualIds = useMemo(() => mutualConnectionIds(state, meId, other.id), [state, meId, other.id]);
  const mutualUsers = useMemo(
    () => mutualIds.map(id => state.users.find(u => u.id === id)).filter((u): u is User => !!u),
    [mutualIds, state.users],
  );
  const followingEachOther = isMutual(state, meId, other.id);

  const muted = isQuran ? "text-zinc-400" : "text-muted-foreground";
  const title = isQuran ? "text-zinc-50" : "text-foreground";

  const shell = "shrink-0 w-full flex flex-col items-center px-4 py-3 text-center";

  return (
    <div className={shell}>
      <button
        type="button"
        onClick={onOpenProfile}
        className="rounded-full transition active:scale-[0.98]"
        aria-label={`عرض ملف @${other.username}`}
      >
        <Avatar name={other.username} src={other.avatar} size={72} />
      </button>

      <button type="button" onClick={onOpenProfile} className="mt-3 flex max-w-full items-center justify-center gap-1">
        <span className={"truncate text-lg font-semibold " + title}>@{other.username}</span>
        <VerifiedMarkForUser user={other} size={16} />
      </button>

      <div className="mt-4 grid w-full max-w-[280px] grid-cols-3 gap-3">
        <div>
          <div className={"text-base font-bold tabular-nums " + title}>{formatCompactCount(postCount)}</div>
          <div className={"text-xs " + muted}>منشورات</div>
        </div>
        <div>
          <div className={"text-base font-bold tabular-nums " + title}>
            {hideFollowStats ? "—" : formatCompactCount(followerCount)}
          </div>
          <div className={"text-xs " + muted}>متابعون</div>
        </div>
        <div>
          <div className={"text-base font-bold tabular-nums " + title}>
            {hideFollowStats ? "—" : formatCompactCount(other.following.length)}
          </div>
          <div className={"text-xs " + muted}>يتابع</div>
        </div>
      </div>

      {mutualUsers.length > 0 ? (
        <div className="mt-4 flex max-w-full flex-col items-center gap-2">
          <div className="flex items-center justify-center -space-x-2 rtl:space-x-reverse">
            {mutualUsers.slice(0, 3).map(u => (
              <Avatar key={u.id} name={u.username} src={u.avatar} size={28} />
            ))}
          </div>
          <p className={"text-sm " + muted}>
            {mutualUsers.length === 1
              ? `صديق مشترك · @${mutualUsers[0]!.username}`
              : `${formatCompactCount(mutualUsers.length)} أصدقاء مشتركون`}
          </p>
        </div>
      ) : followingEachOther ? (
        <p className={"mt-4 text-sm " + muted}>أنتم تتابعان بعضكم</p>
      ) : userIsFollowing(state, meId, other.id) ? (
        <p className={"mt-4 text-sm " + muted}>أنت تتابعه</p>
      ) : theyFollowViewer(state, meId, other.id) ? (
        <p className={"mt-4 text-sm " + muted}>يتابعك</p>
      ) : null}

      {other.bio?.trim() ? (
        <p className={"mt-3 max-w-sm text-sm leading-relaxed line-clamp-2 " + muted}>{other.bio.trim()}</p>
      ) : null}

      {!hideStartConversationHint && !hasMessages ? (
        <p className={"mt-3 text-xs " + muted}>أرسل رسالة لبدء المحادثة</p>
      ) : null}
    </div>
  );
}
