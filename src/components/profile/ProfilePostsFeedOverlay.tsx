import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { RtlScreenHeader, SlideDismissShell } from "../SlideDismissShell";
import { useApp } from "@/lib/store";
import type { Post, ProfileGridTab } from "@/lib/types";
import { ProfileFeedItem } from "./ProfileFeedItem";

const TAB_TITLE_AR: Record<ProfileGridTab, string> = {
  posts: "المنشورات",
  reposts: "إعادات النشر",
  likes: "الإعجابات",
};

export function ProfilePostsFeedOverlay({
  postIds,
  initialIndex,
  profileOwnerId,
  gridTab,
  initialCommentsOpen = false,
  onClose,
  onOpenProfile,
  onOpenChat,
}: {
  postIds: string[];
  initialIndex: number;
  profileOwnerId: string;
  gridTab: ProfileGridTab;
  initialCommentsOpen?: boolean;
  onClose: () => void;
  onOpenProfile: (id: string, ctx?: import("@/lib/types").ProfileReturnContext) => void;
  onOpenChat: (chatId: string) => void;
}) {
  const { state } = useApp();
  const posts = useMemo(
    () => postIds.map(id => state.posts.find(p => p.id === id)).filter((p): p is Post => !!p),
    [state.posts, postIds],
  );
  const scrollKeyRef = useRef("");

  const scrollTargetKey = `${postIds.join(",")}|${initialIndex}|${initialCommentsOpen ? "c" : "p"}`;

  useLayoutEffect(() => {
    if (posts.length === 0) return;
    if (scrollKeyRef.current === scrollTargetKey) return;
    scrollKeyRef.current = scrollTargetKey;
    const id = posts[Math.min(initialIndex, posts.length - 1)]?.id;
    if (!id) return;
    requestAnimationFrame(() => {
      const anchor = initialCommentsOpen ? `profile-feed-comments-${id}` : `profile-feed-section-${id}`;
      document.getElementById(anchor)?.scrollIntoView({ block: "start", behavior: "auto" });
    });
  }, [posts, initialIndex, initialCommentsOpen, scrollTargetKey]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
      scrollKeyRef.current = "";
    };
  }, []);

  return (
    <div data-no-tab-swipe>
      <SlideDismissShell onDismiss={onClose} overlayZIndex={220} className="bg-background">
        <div className="flex h-[100dvh] w-full flex-col overflow-hidden border-x border-border shadow-xl">
          <RtlScreenHeader
            onBack={onClose}
            className="bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80"
            title={
              <>
                <span className="block truncate">{TAB_TITLE_AR[gridTab]}</span>
                <span className="block truncate text-[11px] font-normal text-muted-foreground">مرّر لأعلى أو لأسفل</span>
              </>
            }
          />
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain [scrollbar-gutter:stable]">
            {posts.map(p => (
              <section key={p.id} id={`profile-feed-section-${p.id}`} className="last:border-b-0">
                <ProfileFeedItem
                  post={p}
                  profileOwnerId={profileOwnerId}
                  gridTab={gridTab}
                  onOpenProfile={onOpenProfile}
                  onOpenChat={onOpenChat}
                />
              </section>
            ))}
          </div>
        </div>
      </SlideDismissShell>
    </div>
  );
}
