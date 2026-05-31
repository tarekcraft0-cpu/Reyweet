import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Avatar } from "../Avatar";
import {
  useAppSelector,
  useIsGuestSelector,
  userById,
  userHasVisibleStories,
} from "@/lib/store";
import { equalIdArrays } from "@/lib/useAppSelector";
import { authorHasUnseenStories, orderStoryTrayUserIds } from "@/lib/storyTray";
import { notifyGuestActionBlocked } from "@/lib/guestBlocked";
import { useT } from "@/lib/i18n";
import { useProfiledRender } from "@/lib/renderProfiler";
import type { ID } from "@/lib/types";

export type StoryOpenRequest = {
  userId: ID;
  storyId?: string;
  origin?: DOMRect;
};

type Props = {
  userIds: ID[];
  onOpenStory: (req: StoryOpenRequest) => void;
  onCreateStory: () => void;
};

type TrayUserRow = {
  id: ID;
  label: string;
  avatar: string;
  unseen: boolean;
};

function equalTrayUsers(a: readonly (TrayUserRow | null)[], b: readonly (TrayUserRow | null)[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (!x || !y) return x === y;
    if (x.id !== y.id || x.unseen !== y.unseen || x.avatar !== y.avatar || x.label !== y.label) {
      return false;
    }
  }
  return true;
}

const StoryTrayItem = memo(function StoryTrayItem({
  label,
  avatar,
  unseen,
  onOpen,
}: {
  label: string;
  avatar: string;
  unseen: boolean;
  onOpen: (origin: DOMRect) => void;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [visible, setVisible] = useState(false);
  const ioRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    const el = btnRef.current;
    if (!el) return;
    ioRef.current = new IntersectionObserver(
      entries => {
        if (entries[0]?.isIntersecting) setVisible(true);
      },
      { rootMargin: "80px" },
    );
    ioRef.current.observe(el);
    return () => ioRef.current?.disconnect();
  }, []);

  return (
    <button
      ref={btnRef}
      type="button"
      onClick={() => {
        const rect = btnRef.current?.getBoundingClientRect();
        if (rect) onOpen(rect);
      }}
      className="flex w-[4.25rem] shrink-0 flex-col items-center gap-1 touch-manipulation story-tray-item"
      style={{
        contentVisibility: visible ? "visible" : "auto",
        containIntrinsicSize: "0 88px",
      }}
    >
      <Avatar name={label} src={avatar} size={66} ring ringSeen={!unseen} />
      <span className="max-w-[4.25rem] truncate text-[11px] text-foreground">{label}</span>
    </button>
  );
});

export const StoriesRow = memo(function StoriesRow({ userIds, onOpenStory, onCreateStory }: Props) {
  useProfiledRender("StoriesRow");
  const userIdsRef = useRef(userIds);
  userIdsRef.current = userIds;
  const isGuest = useIsGuestSelector();
  const me = useAppSelector(s => {
    const id = s.currentUserId;
    if (!id) return null;
    return userById(s, id) ?? null;
  });
  const t = useT();
  const scrollRef = useRef<HTMLDivElement>(null);

  const orderedIds = useAppSelector(
    s => {
      const meId = s.currentUserId;
      if (!meId) return [] as ID[];
      return orderStoryTrayUserIds(s, meId, userIdsRef.current);
    },
    equalIdArrays,
  );

  const hasMyStories = useAppSelector(s => {
    const meId = s.currentUserId;
    if (!meId) return false;
    return userHasVisibleStories(s, meId, meId);
  });

  const myRingSeen = useAppSelector(s => {
    const meId = s.currentUserId;
    if (!meId) return true;
    return !authorHasUnseenStories(s, meId, meId);
  });

  const meIdRef = useRef(me?.id);
  meIdRef.current = me?.id;

  const trayUsers = useAppSelector(
    s => {
      const meId = meIdRef.current;
      const ids = s.currentUserId
        ? orderStoryTrayUserIds(s, s.currentUserId, userIdsRef.current)
        : [];
      return ids.map(id => {
        const u = userById(s, id);
        if (!u) return null;
        return {
          id,
          label: u.username,
          avatar: u.avatar,
          unseen: meId ? authorHasUnseenStories(s, meId, id) : false,
        };
      });
    },
    equalTrayUsers,
  );

  const myBtnRef = useRef<HTMLButtonElement>(null);

  const openMyStory = useCallback(() => {
    if (!me) return;
    if (isGuest) {
      notifyGuestActionBlocked();
      return;
    }
    const rect = myBtnRef.current?.getBoundingClientRect();
    if (hasMyStories) {
      onOpenStory({ userId: me.id, origin: rect });
      return;
    }
    onCreateStory();
  }, [hasMyStories, isGuest, me, onCreateStory, onOpenStory]);

  const createNewStory = useCallback(
    (e?: React.SyntheticEvent) => {
      e?.stopPropagation();
      e?.preventDefault();
      if (isGuest) {
        notifyGuestActionBlocked();
        return;
      }
      onCreateStory();
    },
    [isGuest, onCreateStory],
  );

  const openFriend = useCallback(
    (id: ID, origin: DOMRect) => {
      onOpenStory({ userId: id, origin });
    },
    [onOpenStory],
  );

  if (!me) return null;

  return (
    <section
      aria-label="الستوريات"
      className="relative z-10 shrink-0 border-b border-border bg-background"
    >
      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto overscroll-x-contain px-4 py-3 no-scrollbar scroll-smooth"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        <button
          ref={myBtnRef}
          type="button"
          onClick={openMyStory}
          aria-disabled={isGuest}
          className={
            "flex w-[4.25rem] shrink-0 flex-col items-center gap-1 touch-manipulation " +
            (isGuest ? "cursor-not-allowed opacity-50" : "")
          }
        >
          <div className="relative">
            <Avatar
              name={me.username}
              src={me.avatar}
              size={66}
              ring={hasMyStories}
              ringSeen={hasMyStories && myRingSeen}
            />
            <span
              role="button"
              tabIndex={0}
              aria-label="إنشاء ستوري"
              onClick={createNewStory}
              onKeyDown={e => {
                if (e.key === "Enter" || e.key === " ") createNewStory(e);
              }}
              className="absolute -bottom-0.5 -end-0.5 z-10 flex h-5 w-5 cursor-pointer items-center justify-center rounded-full bg-primary text-xs text-primary-foreground shadow"
            >
              +
            </span>
          </div>
          <span className="max-w-[4.25rem] truncate text-[11px]">{t("yourStory")}</span>
        </button>

        {trayUsers.map(row => {
          if (!row) return null;
          return (
            <StoryTrayItem
              key={row.id}
              label={row.label}
              avatar={row.avatar}
              unseen={row.unseen}
              onOpen={origin => openFriend(row.id, origin)}
            />
          );
        })}
      </div>
    </section>
  );
});
