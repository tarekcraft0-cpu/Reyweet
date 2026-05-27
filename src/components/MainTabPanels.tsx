import { memo, type ReactNode } from "react";
import { TabPanelShell } from "./TabPanelShell";
import { HomeScreen } from "./screens/HomeScreen";
import { SearchScreen } from "./screens/SearchScreen";
import { ReelsScreen } from "./screens/ReelsScreen";
import { ChatScreen } from "./screens/ChatScreen";
import type { ProfileReturnContext } from "@/lib/types";

/** لوحة ريلز ثابتة — لا تُعاد إنشاؤها عند تغيّر profile/chat في App */
export const ReelsTabPanel = memo(function ReelsTabPanel({
  onOpenProfile,
  onOpenChat,
  restoreFromProfileContext,
  onConsumedRestoreFromProfile,
}: {
  onOpenProfile: (id: string, ctx?: ProfileReturnContext) => void;
  onOpenChat: (chatId: string) => void;
  restoreFromProfileContext: ProfileReturnContext | null;
  onConsumedRestoreFromProfile: () => void;
}) {
  return (
    <TabPanelShell lockScroll fullHeight chrome="reels">
      <ReelsScreen
        onOpenProfile={onOpenProfile}
        onOpenChat={onOpenChat}
        restoreFromProfileContext={restoreFromProfileContext}
        onConsumedRestoreFromProfile={onConsumedRestoreFromProfile}
      />
    </TabPanelShell>
  );
});

export const HomeTabPanel = memo(function HomeTabPanel({
  onOpenProfile,
  onOpenChat,
  restoreFromProfileContext,
  onConsumedRestoreFromProfile,
}: {
  onOpenProfile: (id: string, ctx?: ProfileReturnContext) => void;
  onOpenChat: (chatId: string) => void;
  restoreFromProfileContext: ProfileReturnContext | null;
  onConsumedRestoreFromProfile: () => void;
}) {
  return (
    <TabPanelShell>
      <HomeScreen
        onOpenProfile={onOpenProfile}
        onOpenChat={onOpenChat}
        restoreFromProfileContext={restoreFromProfileContext}
        onConsumedRestoreFromProfile={onConsumedRestoreFromProfile}
      />
    </TabPanelShell>
  );
});

export const SearchTabPanel = memo(function SearchTabPanel({
  onOpenProfile,
  onOpenChat,
  onOpenQuranChat,
  restoreFromProfileContext,
  onConsumedRestoreFromProfile,
}: {
  onOpenProfile: (id: string, ctx?: ProfileReturnContext) => void;
  onOpenChat: (chatId: string) => void;
  onOpenQuranChat: () => void;
  restoreFromProfileContext: ProfileReturnContext | null;
  onConsumedRestoreFromProfile: () => void;
}) {
  return (
    <TabPanelShell>
      <SearchScreen
        onOpenProfile={onOpenProfile}
        onOpenChat={onOpenChat}
        onOpenQuranChat={onOpenQuranChat}
        restoreFromProfileContext={restoreFromProfileContext}
        onConsumedRestoreFromProfile={onConsumedRestoreFromProfile}
      />
    </TabPanelShell>
  );
});

export const ChatTabPanel = memo(function ChatTabPanel({
  onOpenProfile,
  initialChatId,
  onConsumedInitialChat,
  onThreadOpen,
  onHideBottomNav,
  onExitNavRevealProgress,
  onActiveChatChange,
  resumeThreadToProfileUserId,
  onExitThreadToProfile,
  chatImmersiveMode,
}: {
  onOpenProfile: (id: string, ctx?: ProfileReturnContext) => void;
  initialChatId: string | null;
  onConsumedInitialChat: () => void;
  onThreadOpen: (open: boolean) => void;
  onHideBottomNav: (hide: boolean) => void;
  onExitNavRevealProgress: (progress: number | null) => void;
  onActiveChatChange: (chatId: string | null) => void;
  resumeThreadToProfileUserId: string | null;
  onExitThreadToProfile: (profileUserId: string) => void;
  chatImmersiveMode: boolean;
}) {
  return (
    <TabPanelShell lockScroll={chatImmersiveMode} fullHeight={chatImmersiveMode}>
      <ChatScreen
        onOpenProfile={onOpenProfile}
        initialChatId={initialChatId}
        onConsumedInitialChat={onConsumedInitialChat}
        onThreadOpen={onThreadOpen}
        onHideBottomNav={onHideBottomNav}
        onExitNavRevealProgress={onExitNavRevealProgress}
        onActiveChatChange={onActiveChatChange}
        resumeThreadToProfileUserId={resumeThreadToProfileUserId}
        onExitThreadToProfile={onExitThreadToProfile}
      />
    </TabPanelShell>
  );
});

export const ProfileTabPanel = memo(function ProfileTabPanel({
  children,
  lockScroll = false,
}: {
  children: ReactNode;
  /** بروفايل مستخدم آخر — التمرير داخل ProfileScreen وليس التبويب */
  lockScroll?: boolean;
}) {
  return (
    <TabPanelShell lockScroll={lockScroll} fullHeight>
      {lockScroll ? (
        <div className="absolute inset-0 z-0 flex min-h-0 flex-col overflow-hidden">{children}</div>
      ) : (
        children
      )}
    </TabPanelShell>
  );
});
