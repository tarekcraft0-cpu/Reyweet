import { useEffect, useState, useCallback, useMemo, startTransition, type MouseEvent } from "react";
import { useSlideDismissBack } from "@/hooks/useSlideDismissBack";
import { SlideDismissContext } from "./SlideDismissShell";
// import { MainTabPager, PAGER_TAB_CHAIN, type PagerTab } from "./MainTabPager";
// import { StoryViewer } from "./StoryViewer";
import { QURAN_CHANNEL_ID, useApp, userById } from "@/lib/store";
import { STORY_FULLSCREEN_EVENT } from "@/lib/storyChrome";
import { AppErrorBoundary } from "./AppErrorBoundary";
import { TabPanelShell } from "./TabPanelShell";
import { apiBackendEnabled, getApiToken } from "@/lib/apiBackend";
import { logAuthRoute } from "@/lib/authRouteDebug";
import { isGuestUserId } from "@/lib/guestUser";
import { PROFILE_RETURN_POST_KEY, type ProfileReturnContext } from "@/lib/types";
import { useT } from "@/lib/i18n";
import { Home, Search, MessageCircle, Plus, Menu, ChevronDown, ChevronRight, Heart, Lock, User, Footprints, EyeOff, ArrowRight } from "lucide-react";
import { BottomNavSheet } from "./BottomNavSheet";
import { useBottomNavDragContext } from "@/lib/bottomNavDragContext";
import { NAV_HIDE_PROGRESS_CSS_VAR } from "@/hooks/useBottomNavSheet";
import { InstagramReelsIcon } from "./icons/InstagramReelsIcon";
import { VerifiedMarkForUser } from "./VerifiedBadge";
import { HomeScreen } from "./screens/HomeScreen";
import { SearchScreen } from "./screens/SearchScreen";
import { ReelsScreen } from "./screens/ReelsScreen";
import { ChatScreen, CHAT_DISMISS_PULL_CSS_VAR, CHAT_STACK_PROGRESS_VAR } from "./screens/ChatScreen";
import { isDocumentRtl } from "@/hooks/useSlideDismissBack";
import { ProfileScreen } from "./screens/ProfileScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { CreateScreen, type CreateScreenInitial } from "./screens/CreateScreen";
import { EditProfileScreen } from "./screens/EditProfileScreen";
import { AuthScreen } from "./screens/AuthScreen";
import { GuestBrowseProfilePrompt } from "./GuestBrowseProfilePrompt";
import { notifyGuestActionBlocked } from "@/lib/guestBlocked";
import { NotificationsPanel } from "./NotificationsPanel";
import { NotificationBanner } from "./NotificationBanner";
import { Avatar } from "./Avatar";
import { AccountSwitcherSheet } from "./rsocial/AccountSwitcherSheet";
import { ACCOUNT_SWITCHED_EVENT } from "@/lib/accountSessions";
import logo from "@/assets/logo.png";

type Tab = "home" | "search" | "reels" | "chat" | "profile";
type Modal = null | "settings" | "create" | "edit" | "switcher" | "addAccount" | "notifications" | "visitors";

const NAV_HIDDEN_KEY = "retweet_nav_hidden";

export function App() {
  const {
    state,
    currentUser,
    accountSwitching,
    accountSessionKey,
    switchAccount,
    createSticker,
    openOrCreateChat,
    updateProfile,
    isGuest,
    exitGuestBrowseMode,
    joinGroupByInviteCode,
  } = useApp();
  const t = useT();
  const [tab, setTab] = useState<Tab>("home");
  const [modal, setModal] = useState<Modal>(null);
  const [createInitial, setCreateInitial] = useState<CreateScreenInitial | null>(null);
  const [switchingAccountId, setSwitchingAccountId] = useState<string | null>(null);
  const [guestToast, setGuestToast] = useState(false);
  const [viewProfileId, setViewProfileId] = useState<string | null>(null);
  /** لمكدس الرجوع: فتح مستخدم من اقتراحات بروفايل ثم الرجوع يعيد الخطوة السابقة فقط */
  const [profileNavStack, setProfileNavStack] = useState<string[]>([]);
  /** التبويب الذي فتحنا منه بروفايل شخص آخر — للرجوع بدل الافتراض الخاطئ (محادثات) */
  const [profileReturnTargetTab, setProfileReturnTargetTab] = useState<Tab | null>(null);
  /** فُتحت المحادثة من بروفايل (مراسلة): الرجوع من الخيط يعيد نفس البروفايل */
  const [resumeProfileUserId, setResumeProfileUserId] = useState<string | null>(null);
  const [openChatId, setOpenChatId] = useState<string | null>(null);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [chatThreadOpen, setChatThreadOpen] = useState(false);
  const [chatHideBottomNav, setChatHideBottomNav] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  /** إعادة فتح منشور/تعليقات بعد الرجوع من بروفايل (لا يُفوَّض لحدث لأن الشاشة كانت مُزالة من الشجرة) */
  const [restorePostContext, setRestorePostContext] = useState<ProfileReturnContext | null>(null);
  const [navHidden, setNavHidden] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem(NAV_HIDDEN_KEY) === "1";
    } catch {
      return false;
    }
  });
  const clearRestorePostContext = useCallback(() => setRestorePostContext(null), []);

  /** تنقل تبويبات ثابت (بدون سحب أفقي — مؤقتاً لاستقرار الواجهة) */
  const resetChatNavigation = useCallback(() => {
    setOpenChatId(null);
    setActiveChatId(null);
    setChatThreadOpen(false);
    setChatHideBottomNav(false);
    setResumeProfileUserId(null);
    try {
      document.documentElement.style.removeProperty(CHAT_DISMISS_PULL_CSS_VAR);
      document.documentElement.style.removeProperty(CHAT_STACK_PROGRESS_VAR);
    } catch {
      /* ignore */
    }
  }, []);

  const goTab = useCallback((next: Tab) => {
    setTab(next);
    setViewProfileId(null);
    setProfileNavStack([]);
    setProfileReturnTargetTab(null);
    setResumeProfileUserId(null);
    setRestorePostContext(null);
    if (next !== "chat") resetChatNavigation();
  }, [resetChatNavigation]);

  const [storyFullscreen, setStoryFullscreen] = useState(false);

  useEffect(() => {
    const onStoryFullscreen = (e: Event) => {
      const open = Boolean((e as CustomEvent<{ open?: boolean }>).detail?.open);
      setStoryFullscreen(open);
    };
    window.addEventListener(STORY_FULLSCREEN_EVENT, onStoryFullscreen);
    return () => {
      window.removeEventListener(STORY_FULLSCREEN_EVENT, onStoryFullscreen);
      setStoryFullscreen(false);
    };
  }, []);

  const persistNavHidden = useCallback((hidden: boolean) => {
    setNavHidden(hidden);
    try {
      if (hidden) localStorage.setItem(NAV_HIDDEN_KEY, "1");
      else localStorage.removeItem(NAV_HIDDEN_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const handler = (e: any) => createSticker(e.detail.emoji, e.detail.label);
    window.addEventListener("create-sticker", handler);
    return () => window.removeEventListener("create-sticker", handler);
  }, [createSticker]);

  useEffect(() => {
    if (!currentUser || isGuest) return;
    try {
      const pending = localStorage.getItem("retweet_pending_welcome_user");
      const shownKey = `retweet_welcome_shown_${currentUser.id}`;
      const shown = localStorage.getItem(shownKey);
      if (pending === currentUser.id && !shown) {
        setShowWelcome(true);
        localStorage.setItem(shownKey, "1");
        localStorage.removeItem("retweet_pending_welcome_user");
      }
    } catch {
      /* ignore */
    }
  }, [currentUser]);

  useEffect(() => {
    const onOpenChat = (e: Event) => {
      const ce = e as CustomEvent<{ chatId: string }>;
      const id = ce.detail?.chatId;
      if (!id) return;
      setOpenChatId(id);
      setTab("chat");
      setViewProfileId(null);
      setProfileNavStack([]);
      setProfileReturnTargetTab(null);
      setResumeProfileUserId(null);
      setRestorePostContext(null);
    };
    window.addEventListener("retweet-open-chat", onOpenChat);
    return () => window.removeEventListener("retweet-open-chat", onOpenChat);
  }, []);

  useEffect(() => {
    const closeModals = () => {
      setModal(null);
      setCreateInitial(null);
    };
    window.addEventListener("retweet-close-modals", closeModals);
    return () => window.removeEventListener("retweet-close-modals", closeModals);
  }, []);

  useEffect(() => {
    const openCreate = (e: Event) => {
      const d = (e as CustomEvent<CreateScreenInitial>).detail;
      if (d?.type === "story" || d?.media) {
        setCreateInitial(d ?? { type: "story" });
        setModal("create");
      }
    };
    window.addEventListener("retweet-open-create", openCreate);
    return () => window.removeEventListener("retweet-open-create", openCreate);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    if (!hash.startsWith("#create")) return;
    try {
      const q = hash.includes("?") ? hash.slice(hash.indexOf("?") + 1) : "";
      const params = new URLSearchParams(q);
      if (params.get("type") === "story") {
        const media = params.get("media");
        if (media && media.length < 500_000) {
          setCreateInitial({ type: "story", media: decodeURIComponent(media) });
          setModal("create");
        } else if (!media) {
          setCreateInitial({ type: "story" });
          setModal("create");
        }
      }
    } catch {
      /* ignore */
    }
    const path = window.location.pathname + window.location.search;
    window.history.replaceState(null, "", path);
  }, []);

  useEffect(() => {
    const onGuestBlock = () => {
      setGuestToast(true);
      window.setTimeout(() => setGuestToast(false), 2400);
    };
    window.addEventListener("retweet-guest-blocked", onGuestBlock);
    return () => window.removeEventListener("retweet-guest-blocked", onGuestBlock);
  }, []);

  useEffect(() => {
    const onAccountSwitch = () => {
      resetChatNavigation();
      setModal(null);
      setCreateInitial(null);
      setViewProfileId(null);
      setProfileNavStack([]);
      setProfileReturnTargetTab(null);
      setResumeProfileUserId(null);
      setRestorePostContext(null);
      setTab("home");
    };
    window.addEventListener(ACCOUNT_SWITCHED_EVENT, onAccountSwitch);
    window.addEventListener("retweet-reset-chat-ui", onAccountSwitch);
    return () => {
      window.removeEventListener(ACCOUNT_SWITCHED_EVENT, onAccountSwitch);
      window.removeEventListener("retweet-reset-chat-ui", onAccountSwitch);
    };
  }, [resetChatNavigation]);

  useEffect(() => {
    if (typeof window === "undefined" || !currentUser || isGuest) return;
    const code = new URLSearchParams(window.location.search).get("group")?.trim();
    if (!code) return;
    void (async () => {
      const res = await joinGroupByInviteCode(code);
      if (res.ok && res.pending) {
        window.alert("تم إرسال طلب الانضمام — بانتظار موافقة المشرف");
        setTab("chat");
      } else if (res.ok && res.chatId) {
        setOpenChatId(res.chatId);
        setTab("chat");
      } else if (!res.ok) {
        window.alert(res.error);
      }
      const url = new URL(window.location.href);
      url.searchParams.delete("group");
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    })();
  }, [currentUser?.id, isGuest, joinGroupByInviteCode]);

  /** يجب أن يبقى قبل أي return شرطي — وإلا React error #310 (شاشة بيضاء بعد تسجيل الدخول) */
  const openProfile = useCallback(
    (id: string, returnCtx?: ProfileReturnContext) => {
      try {
        if (returnCtx) sessionStorage.setItem(PROFILE_RETURN_POST_KEY, JSON.stringify(returnCtx));
        else if (tab !== "profile") sessionStorage.removeItem(PROFILE_RETURN_POST_KEY);
      } catch {
        /* ignore */
      }
      if (!currentUser) return;

      if (id === currentUser.id) {
        setProfileNavStack([]);
        setProfileReturnTargetTab(null);
        setViewProfileId(null);
        setTab("profile");
        return;
      }

      if (tab === "profile") {
        setProfileNavStack(prev => {
          const cur = viewProfileId ?? currentUser.id;
          if (cur !== id) return [...prev, cur];
          return prev;
        });
      } else {
        setProfileReturnTargetTab(tab);
        setProfileNavStack([]);
      }
      setViewProfileId(id);
      setTab("profile");
    },
    [tab, viewProfileId, currentUser],
  );

  const popProfileScreenBack = useCallback(() => {
    if (modal) {
      setModal(null);
      setCreateInitial(null);
      return;
    }
    if (!viewProfileId || viewProfileId === currentUser?.id) return;

    const pendingStoryOwner = typeof window !== "undefined" ? sessionStorage.getItem("retweet_return_story_user_id") : null;
    const pendingPostRaw = typeof window !== "undefined" ? sessionStorage.getItem(PROFILE_RETURN_POST_KEY) : null;
    if (pendingPostRaw) {
      try {
        const ctx = JSON.parse(pendingPostRaw) as ProfileReturnContext;
        sessionStorage.removeItem(PROFILE_RETURN_POST_KEY);
        if (ctx.tab === "profile" && ctx.profileUserId) {
          startTransition(() => {
            setProfileReturnTargetTab(null);
            setViewProfileId(ctx.profileUserId!);
            setTab("profile");
          });
          queueMicrotask(() => {
            try {
              window.dispatchEvent(new CustomEvent("retweet-restore-profile-feed", { detail: ctx }));
            } catch {
              /* ignore */
            }
          });
          return;
        }
        startTransition(() => {
          setProfileReturnTargetTab(null);
          setViewProfileId(null);
          setTab(ctx.tab);
          setRestorePostContext(ctx);
        });
        return;
      } catch {
        try {
          sessionStorage.removeItem(PROFILE_RETURN_POST_KEY);
        } catch {
          /* ignore */
        }
      }
    }

    setProfileNavStack(prev => {
      if (prev.length > 0) {
        const popped = prev[prev.length - 1]!;
        startTransition(() => {
          if (popped === currentUser!.id) {
            setViewProfileId(null);
            const rt = profileReturnTargetTab;
            setProfileReturnTargetTab(null);
            if (rt && rt !== "profile") setTab(rt);
          } else {
            setViewProfileId(popped);
          }
        });
        return prev.slice(0, -1);
      }
      startTransition(() => {
        setViewProfileId(null);
        if (pendingStoryOwner) {
          try {
            window.dispatchEvent(new CustomEvent("retweet-open-story", { detail: { userId: pendingStoryOwner } }));
            sessionStorage.removeItem("retweet_return_story_user_id");
          } catch {
            /* ignore */
          }
          setProfileReturnTargetTab(null);
          setTab("home");
          return;
        }
        const rt = profileReturnTargetTab;
        setProfileReturnTargetTab(null);
        const nextTab = rt ?? "home";
        setTab(nextTab);
        if (nextTab === "chat" && activeChatId) {
          queueMicrotask(() => setOpenChatId(activeChatId));
        } else {
          queueMicrotask(() => setOpenChatId(null));
        }
      });
      return prev;
    });
  }, [modal, viewProfileId, currentUser, profileReturnTargetTab, activeChatId]);

  useEffect(() => {
    logAuthRoute("app-render", {
      screen: currentUser ? "main" : getApiToken() ? "session-repair" : "auth",
      currentUserId: state.currentUserId,
      username: currentUser?.username,
      tab,
      hasToken: !!getApiToken(),
    });
  }, [currentUser, state.currentUserId, tab]);

  useEffect(() => {
    if (tab === "chat") return;
    try {
      document.documentElement.style.removeProperty(CHAT_DISMISS_PULL_CSS_VAR);
    } catch {
      /* ignore */
    }
  }, [tab]);

  if (!currentUser) {
    if (getApiToken() && apiBackendEnabled()) {
      return (
        <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-background px-6 text-center text-sm text-muted-foreground">
          <p>جاري تحميل حسابك…</p>
          <p className="text-xs">إن استمرت الشاشة فارغة، حدّث الصفحة (F5)</p>
        </div>
      );
    }
    logAuthRoute("gate-auth-screen");
    return <AuthScreen />;
  }

  if (accountSwitching) {
    return (
      <div
        key={`switch-${accountSessionKey}`}
        className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-background px-6 text-center text-sm text-muted-foreground"
      >
        <p className="font-medium text-foreground">جاري تبديل الحساب…</p>
        <p className="text-xs">يتم قطع الاتصال الآمن وتحميل بيانات الحساب الجديد</p>
      </div>
    );
  }

  const goChat = (chatId: string) => {
    setOpenChatId(chatId);
    setTab("chat");
    setViewProfileId(null);
    setProfileNavStack([]);
    setProfileReturnTargetTab(null);
    setResumeProfileUserId(null);
    setRestorePostContext(null);
  };
  const unreadNotifs = (state.notifications ?? []).filter(
    n => n.userId === currentUser.id && !n.read && n.type !== "message",
  ).length;
  const showChatThreadChrome = tab === "chat" && chatThreadOpen;

  const profilePanel =
    tab === "profile" && !viewProfileId && isGuest ? (
      <GuestBrowseProfilePrompt onGoLogin={() => exitGuestBrowseMode()} />
    ) : (
      <ProfileScreen
        userId={viewProfileId || currentUser.id}
        showSuggestAccountsEntry={profileNavStack.length === 0}
        onOpenProfile={openProfile}
        onOpenExistingChat={chatId => {
          if (viewProfileId) setResumeProfileUserId(viewProfileId);
          setOpenChatId(chatId);
          setTab("chat");
          setViewProfileId(null);
        }}
        onOpenChannel={chatId => {
          if (viewProfileId) setResumeProfileUserId(viewProfileId);
          setOpenChatId(chatId);
          setTab("chat");
          setViewProfileId(null);
        }}
        onBack={viewProfileId && viewProfileId !== currentUser.id ? popProfileScreenBack : undefined}
        onEdit={() => setModal("edit")}
        onOpenAccountSwitcher={isGuest ? undefined : () => setModal("switcher")}
        onOpenSettings={isGuest ? undefined : () => setModal("settings")}
        onOpenVisitors={isGuest ? undefined : () => setModal("visitors")}
        onOpenChat={targetUserId => {
          if (targetUserId === currentUser.id) return;
          const ch = openOrCreateChat(targetUserId);
          if (!ch) {
            if (isGuest) notifyGuestActionBlocked();
            else
              window.alert("تعذّر فتح المحادثة. أعد المحاولة أو حدّث الصفحة إن استمرت المشكلة.");
            return;
          }
          if (viewProfileId && viewProfileId !== currentUser.id) setResumeProfileUserId(viewProfileId);
          setOpenChatId(ch.id);
          setTab("chat");
        }}
      />
    );

  const onProfileTab = tab === "profile" && !viewProfileId;
  const hideAppHeader = tab === "chat" || tab === "search" || onProfileTab || storyFullscreen;
  const hideBottomBar = showChatThreadChrome || storyFullscreen || chatHideBottomNav;

  return (
    <div
      key={accountSessionKey}
      className={
        "relative mx-auto flex w-full max-w-md flex-col overflow-x-hidden overscroll-none bg-background pt-[env(safe-area-inset-top,0px)] supports-[height:100dvh]:min-h-dvh " +
        (chatThreadOpen ? "h-dvh max-h-dvh overflow-hidden" : "min-h-dvh [-webkit-overflow-scrolling:touch]")
      }
    >
      {guestToast && (
        <div className="fixed left-3 right-3 top-[max(0.75rem,env(safe-area-inset-top,0px))] z-[500] mx-auto max-w-md rounded-2xl border border-border bg-card px-4 py-3 text-start text-sm shadow-lg">
          سجّل الدخول أو أنشئ حساباً لاستخدام هذه الميزة (إعجاب، رسائل، متابعة…).
        </div>
      )}
      {!storyFullscreen && !chatThreadOpen && <NotificationBanner />}
      {!hideAppHeader && (
      <header
        className={
          "sticky top-0 bg-background/90 backdrop-blur border-b border-border px-4 py-3 " +
          (showChatThreadChrome ? "z-[195] pointer-events-none" : "z-30")
        }
        style={
          showChatThreadChrome
            ? {
                opacity: `calc(1 - var(${CHAT_STACK_PROGRESS_VAR}, 0) * 0.4)`,
                transform: isDocumentRtl()
                  ? `translate3d(calc(var(${CHAT_STACK_PROGRESS_VAR}, 0) * -18%), 0, 0)`
                  : `translate3d(calc(var(${CHAT_STACK_PROGRESS_VAR}, 0) * 18%), 0, 0)`,
              }
            : undefined
        }
      >
        <div dir="ltr" className="flex items-center justify-between">
          {/* Left side - Settings button */}
          <div className="flex items-center gap-2">
            {onProfileTab && !isGuest && <button onClick={() => setModal("settings")} aria-label={t("settings")}><Menu size={24} /></button>}
            {onProfileTab && !isGuest && (
              <button type="button" onClick={() => setModal("visitors")} aria-label="زوار الملف" className="p-1 rounded-full hover:bg-secondary">
                <Footprints size={22} />
              </button>
            )}
            {tab === "home" && !onProfileTab && !isGuest && (
              <button type="button" onClick={() => setModal("notifications")} className="relative p-1 rounded-full hover:bg-secondary" aria-label={t("notifications")}>
                <Heart size={20} />
                {unreadNotifs > 0 && <span className="absolute -top-1 -end-1 bg-destructive text-destructive-foreground text-[10px] min-w-4 h-4 px-1 rounded-full flex items-center justify-center">{unreadNotifs}</span>}
              </button>
            )}
            {tab === "chat" && <ChevronRight size={24} />}
          </div>
          
          {/* Center - App name or user switcher */}
          <div className="flex items-center gap-2">
            {(tab === "home" || tab === "reels") ? (
              <>
                <img src={logo} alt="Retweet" className="w-7 h-7 dark:invert" />
                <span className="font-bold text-lg">Retweet</span>
                {currentUser.isPrivate && <Lock size={14} className="text-muted-foreground" />}
              </>
            ) : tab === "search" ? (
              <div className="w-32"></div>
            ) : (
              <button type="button" onClick={() => setModal("switcher")} className="flex items-center gap-1 font-bold px-2 py-1 rounded-full hover:bg-secondary/80 active:scale-[0.98] transition max-w-[min(100%,11rem)]">
                <span className="truncate">@{currentUser.username}</span>
                <VerifiedMarkForUser user={currentUser} size={18} />
                <ChevronDown size={16} className="shrink-0" />
              </button>
            )}
          </div>
          
          {/* Right side - Plus button */}
          <div className="flex items-center gap-2">
            {!isGuest && <button onClick={() => setModal("create")} aria-label={t("create")}><Plus size={24} /></button>}
          </div>
        </div>
      </header>
      )}

      <main
        className={"flex min-h-0 flex-1 flex-col break-words text-start " + (chatThreadOpen ? "overflow-hidden pb-4 " : "")}
        style={
          !chatThreadOpen && !hideBottomBar
            ? {
                paddingBottom: `calc((1 - var(${NAV_HIDE_PROGRESS_CSS_VAR}, ${navHidden ? 1 : 0})) * (5.25rem + max(0.75rem, env(safe-area-inset-bottom, 0px))) + var(${NAV_HIDE_PROGRESS_CSS_VAR}, ${navHidden ? 1 : 0}) * (2.25rem + max(0.5rem, env(safe-area-inset-bottom, 0px))))`,
              }
            : undefined
        }
      >
        <AppErrorBoundary key={tab} label={`تبويب: ${tab}`}>
          <TabPanelShell lockScroll={tab === "reels"}>
            {tab === "home" && (
              <HomeScreen
                onOpenProfile={openProfile}
                onOpenChat={goChat}
                restoreFromProfileContext={restorePostContext?.tab === "home" ? restorePostContext : null}
                onConsumedRestoreFromProfile={clearRestorePostContext}
              />
            )}
            {tab === "search" && (
              <SearchScreen
                onOpenProfile={openProfile}
                onOpenChat={goChat}
                onOpenQuranChat={() => {
                  setOpenChatId(QURAN_CHANNEL_ID);
                  setProfileReturnTargetTab(null);
                  setResumeProfileUserId(null);
                  setRestorePostContext(null);
                  setTab("chat");
                }}
                restoreFromProfileContext={restorePostContext?.tab === "search" ? restorePostContext : null}
                onConsumedRestoreFromProfile={clearRestorePostContext}
              />
            )}
            {tab === "reels" && (
              <ReelsScreen
                onOpenProfile={openProfile}
                onOpenChat={goChat}
                restoreFromProfileContext={restorePostContext?.tab === "reels" ? restorePostContext : null}
                onConsumedRestoreFromProfile={clearRestorePostContext}
              />
            )}
            {tab === "chat" && (
              <ChatScreen
                key={accountSessionKey}
                onOpenProfile={openProfile}
                initialChatId={openChatId}
                onConsumedInitialChat={() => setOpenChatId(null)}
                onThreadOpen={setChatThreadOpen}
                onHideBottomNav={setChatHideBottomNav}
                onActiveChatChange={setActiveChatId}
                resumeThreadToProfileUserId={resumeProfileUserId}
                onExitThreadToProfile={profileUserId => {
                  setResumeProfileUserId(null);
                  setOpenChatId(null);
                  startTransition(() => {
                    setViewProfileId(profileUserId);
                    setTab("profile");
                  });
                }}
              />
            )}
            {tab === "profile" && profilePanel}
          </TabPanelShell>
        </AppErrorBoundary>
      </main>

      {/* مؤقتاً: عارض ستوري عام من App (يُعاد عبر storyChrome لاحقاً) */}

      {!hideBottomBar && (
        <BottomNavSheet initialHidden={navHidden} onPersistHidden={persistNavHidden}>
          <NavBtn active={tab === "home"} onClick={() => goTab("home")}>
            <Home strokeWidth={2} />
          </NavBtn>
          <NavBtn active={tab === "search"} onClick={() => goTab("search")}>
            <Search strokeWidth={2} />
          </NavBtn>
          <NavBtn active={tab === "reels"} onClick={() => goTab("reels")}>
            <InstagramReelsIcon size={26} strokeWidth={2} />
          </NavBtn>
          <NavBtn active={tab === "chat"} onClick={() => goTab("chat")}>
            <MessageCircle strokeWidth={2} />
          </NavBtn>
          <NavBtn active={onProfileTab} onClick={() => goTab("profile")}>
            <User strokeWidth={2} />
          </NavBtn>
        </BottomNavSheet>
      )}

      {modal === "settings" && <Sheet onClose={() => setModal(null)} contentClassName="bg-black">
        <SettingsScreen
          onBack={() => setModal(null)}
          onOpenAccounts={() => {
            setModal("switcher");
          }}
        />
      </Sheet>}
      {modal === "create" && (
        <Sheet
          onClose={() => {
            setCreateInitial(null);
            setModal(null);
          }}
        >
          <CreateScreen
            initial={createInitial}
            onBack={() => {
              setCreateInitial(null);
              setModal(null);
            }}
          />
        </Sheet>
      )}
      {modal === "edit" && <Sheet onClose={() => setModal(null)}><EditProfileScreen onBack={() => setModal(null)} /></Sheet>}
      {modal === "notifications" && <NotificationsPanel onClose={() => setModal(null)} onOpenProfile={openProfile} onOpenChat={goChat} />}
      {modal === "visitors" && (
        <Sheet onClose={() => setModal(null)}>
          <div className="p-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              <button
                type="button"
                onClick={() => setModal(null)}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground px-3 py-2 rounded-full hover:bg-secondary active:scale-[0.98] transition"
              >
                <ArrowRight size={18} aria-hidden />
                رجوع
              </button>
              <button
                type="button"
                onClick={() => setModal(null)}
                className="text-sm font-semibold px-4 py-2 rounded-full bg-primary text-primary-foreground hover:opacity-90 active:scale-[0.98] transition"
              >
                تم
              </button>
            </div>
            <div className="flex items-center justify-between gap-3 mb-4 pb-3 border-b border-border">
              <span className="text-sm text-muted-foreground flex-1">إظهار اسمك عند زيارة ملفات الآخرين</span>
              <button
                type="button"
                onClick={() => {
                  const on = currentUser.shareProfileVisitActivity !== false;
                  updateProfile({ shareProfileVisitActivity: !on });
                }}
                className={
                  "shrink-0 p-2 rounded-full border transition-colors " +
                  (currentUser.shareProfileVisitActivity !== false
                    ? "border-border bg-secondary hover:bg-secondary/80"
                    : "border-muted-foreground/40 bg-muted/60 hover:bg-muted/80")
                }
                title={currentUser.shareProfileVisitActivity !== false ? "مفعّل: يظهر أنك زرتهم" : "معطّل: إخفاء زياراتك"}
                aria-pressed={currentUser.shareProfileVisitActivity !== false}
              >
                {currentUser.shareProfileVisitActivity !== false ? <Footprints size={20} /> : <EyeOff size={20} className="text-muted-foreground" />}
              </button>
            </div>
            <h3 className="font-bold text-lg mb-3">آخر زوار ملفك</h3>
            <div className="space-y-2">
              {(currentUser.profileViews || []).slice(0, 30).map((v, i) => {
                const u = userById(state, v.userId);
                if (!u) return null;
                return (
                  <button key={`${v.userId}_${i}`} className="w-full flex items-center justify-between p-3 rounded-2xl hover:bg-secondary" onClick={() => { setModal(null); openProfile(u.id); }}>
                    <span className="font-semibold">@{u.username}</span>
                    <span className="text-xs text-muted-foreground">{new Date(v.at).toLocaleTimeString()}</span>
                  </button>
                );
              })}
              {(currentUser.profileViews || []).length === 0 && <p className="text-sm text-muted-foreground text-center py-6">لا يوجد زوار بعد</p>}
            </div>
          </div>
        </Sheet>
      )}
      {modal === "switcher" && (
        <AccountSwitcherSheet
          switchingAccountId={switchingAccountId}
          onSwitching={setSwitchingAccountId}
          onClose={() => setModal(null)}
          onAddAccount={() => setModal("addAccount")}
        />
      )}
      {modal === "addAccount" && (
        <div className="fixed inset-0 z-[250] bg-background flex flex-col overflow-y-auto">
          <div className="sticky top-0 flex items-center gap-2 p-3 border-b border-border bg-background z-10">
            <button type="button" onClick={() => setModal(null)} className="text-sm font-semibold text-primary px-2 py-1 rounded-full hover:bg-secondary">
              {t("cancel")}
            </button>
            <span className="flex-1 text-center text-sm font-semibold">إضافة حساب</span>
            <span className="w-16" />
          </div>
          <AuthScreen onAuthSuccess={() => setModal(null)} allowGuestBrowse={false} />
        </div>
      )}
      {showWelcome && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4" onClick={() => setShowWelcome(false)}>
          <div className="bg-background rounded-3xl p-6 w-full max-w-sm text-center" onClick={e => e.stopPropagation()}>
            <h2 className="text-2xl font-extrabold mb-2">مرحبا بك</h2>
            <p className="text-sm mb-1">اهلا بك في Retweet</p>
            <p className="text-sm mb-3">@{currentUser.username}</p>
            <p className="text-xs text-muted-foreground mb-5">تطبيق من تطوير و برمجه الشيخ/د/أ/ المهندس طارق الكثيري</p>
            <button onClick={() => setShowWelcome(false)} className="w-full bg-primary text-primary-foreground rounded-2xl py-2 font-semibold">ابدأ الآن</button>
          </div>
        </div>
      )}
    </div>
  );
}

function NavBtn({
  active,
  onClick,
  children,
  variant = "icon",
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  variant?: "icon" | "create";
}) {
  const { shouldSuppressTap } = useBottomNavDragContext();

  const handleClick = (e: MouseEvent) => {
    e.stopPropagation();
    if (shouldSuppressTap()) return;
    onClick();
  };

  if (variant === "create") {
    return (
      <button
        type="button"
        onClick={handleClick}
        className="w-12 h-12 shrink-0 touch-manipulation select-none rounded-2xl border border-zinc-300/80 dark:border-zinc-600 flex items-center justify-center text-zinc-900 dark:text-zinc-100 active:scale-[0.92] transition-transform"
        aria-label="Create"
      >
        {children}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={handleClick}
      className={
        "w-12 h-12 shrink-0 touch-manipulation select-none rounded-full flex items-center justify-center " +
        "transition-[transform,background-color,color] duration-200 ease-[cubic-bezier(0.25,0.1,0.25,1)] " +
        (active
          ? "bg-[#E8F4FC] dark:bg-sky-950/50 text-[#0A84FF] scale-[1.02]"
          : "text-zinc-900 dark:text-zinc-100 active:scale-[0.88]")
      }
    >
      {children}
    </button>
  );
}

function Sheet({
  children,
  onClose,
  contentClassName,
}: {
  children: React.ReactNode;
  onClose: () => void;
  contentClassName?: string;
}) {
  const { containerRef, panelStyle, requestDismiss, edgeStripProps } = useSlideDismissBack({ onDismiss: onClose });
  const ctx = useMemo(() => ({ requestDismiss }), [requestDismiss]);
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={requestDismiss} aria-hidden />
      <div className="pointer-events-none fixed inset-x-0 z-50 flex justify-center" style={{ top: 0, bottom: 0 }}>
        <div ref={containerRef} className="pointer-events-auto relative h-full w-full max-w-md overflow-hidden">
          <div {...edgeStripProps} />
          <SlideDismissContext.Provider value={ctx}>
            <div
              className={"h-full overflow-y-auto bg-background " + (contentClassName ?? "")}
              style={panelStyle}
              onClick={e => e.stopPropagation()}
            >
              {children}
            </div>
          </SlideDismissContext.Provider>
        </div>
      </div>
    </>
  );
}
