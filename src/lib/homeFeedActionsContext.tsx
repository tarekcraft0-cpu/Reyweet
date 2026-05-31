import { createContext, useContext, useRef, type MutableRefObject, type ReactNode } from "react";
import type { Post, ProfileReturnContext } from "./types";

export type HomeFeedActions = {
  onShare: (post: Post) => void;
  onOpenProfile: (id: string, ctx?: ProfileReturnContext) => void;
  onOpenChat: (chatId: string) => void;
  openPost: (postId: string) => void;
  openCommentsSheet: (postId: string) => void;
};

const HomeFeedActionsRefCtx = createContext<MutableRefObject<HomeFeedActions> | null>(null);

/** ref ثابت — لا يُعيد رسم عناصر الفيد عند re-render الـ HomeScreen */
export function HomeFeedActionsProvider({
  value,
  children,
}: {
  value: HomeFeedActions;
  children: ReactNode;
}) {
  const ref = useRef(value);
  ref.current = value;
  return (
    <HomeFeedActionsRefCtx.Provider value={ref}>{children}</HomeFeedActionsRefCtx.Provider>
  );
}

export function useHomeFeedActions() {
  const ref = useContext(HomeFeedActionsRefCtx);
  if (!ref) throw new Error("HomeFeedActionsProvider missing");
  return ref.current;
}
