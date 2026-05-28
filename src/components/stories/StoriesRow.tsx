import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Avatar } from "../Avatar";
import { useApp, userById, userHasVisibleStories } from "@/lib/store";
import { authorHasUnseenStories, orderStoryTrayUserIds } from "@/lib/storyTray";
import { notifyGuestActionBlocked } from "@/lib/guestBlocked";
import { useT } from "@/lib/i18n";
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

const StoryTrayItem = memo(function StoryTrayItem({
  id,
  label,
  unseen,
  onOpen,
}: {
  id: ID;
  label: string;
  unseen: boolean;
  onOpen: (origin: DOMRect) => void;
}) {
  const { state } = useApp();
  const u = userById(state, id);
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

  if (!u) return null;

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
      <Avatar
        name={u.username}
        src={u.avatar}
        size={66}
        ring
        ringSeen={!unseen}
      />
      <span className="max-w-[4.25rem] truncate text-[11px] text-foreground">{label}</span>
    </button>
  );
});

export function StoriesRow({ userIds, onOpenStory, onCreateStory }: Props) {
  const { state, currentUser, isGuest } = useApp();
  const t = useT();
  const me = currentUser!;
  const scrollRef = useRef<HTMLDivElement>(null);

  const orderedIds = useMemo(
    () => orderStoryTrayUserIds(state, me.id, userIds),
    [state.stories, userIds, me.id],
  );

  const hasMyStories = useMemo(
    () => userHasVisibleStories(state, me.id, me.id),
    [state.stories, me.id],
  );

  const myBtnRef = useRef<HTMLButtonElement>(null);

  const openMyStory = useCallback(() => {
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
  }, [hasMyStories, isGuest, me.id, onCreateStory, onOpenStory]);

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
              ringSeen={hasMyStories && !authorHasUnseenStories(state, me.id, me.id)}
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

        {orderedIds.map(id => {
          const u = userById(state, id);
          if (!u) return null;
          const unseen = authorHasUnseenStories(state, me.id, id);
          return (
            <StoryTrayItem
              key={id}
              id={id}
              label={u.username}
              unseen={unseen}
              onOpen={origin => openFriend(id, origin)}
            />
          );
        })}
      </div>
    </section>
  );
}
