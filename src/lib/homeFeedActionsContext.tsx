import { createContext, useContext, type ReactNode } from "react";
import type { Post, ProfileReturnContext } from "./types";

export type HomeFeedActions = {
  onShare: (post: Post) => void;
  onOpenProfile: (id: string, ctx?: ProfileReturnContext) => void;
  onOpenChat: (chatId: string) => void;
  openPost: (postId: string) => void;
  openCommentsSheet: (postId: string) => void;
};

const HomeFeedActionsContext = createContext<HomeFeedActions | null>(null);

export function HomeFeedActionsProvider({
  value,
  children,
}: {
  value: HomeFeedActions;
  children: ReactNode;
}) {
  return (
    <HomeFeedActionsContext.Provider value={value}>{children}</HomeFeedActionsContext.Provider>
  );
}

export function useHomeFeedActions() {
  const ctx = useContext(HomeFeedActionsContext);
  if (!ctx) throw new Error("HomeFeedActionsProvider missing");
  return ctx;
}
