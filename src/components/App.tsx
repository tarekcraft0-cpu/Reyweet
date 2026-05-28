import {
  memo,
  useEffect,
  useState,
  useCallback,
  useMemo,
  startTransition,
  type CSSProperties,
} from "react";
import { AppDismissSheet, SlideDismissBackButton } from "./SlideDismissShell";
import { SETTINGS_DISMISS_PULL_CSS_VAR } from "@/lib/navigationDismiss";
import { useGlobalOverlayBack } from "@/hooks/useGlobalOverlayBack";
import { type PagerTab } from "./MainTabPager";
import { MainTabStack } from "./MainTabStack";
// import { StoryViewer } from "./StoryViewer";
import { QURAN_CHANNEL_ID, useApp, userById } from "@/lib/store";
import { STORY_FULLSCREEN_EVENT } from "@/lib/storyChrome";
import {
  notifyStoryPickerClose,
  notifyStoryPickerOpen,
  resetMediaChromeOverlays,
  STORY_GALLERY_OPEN_EVENT,
} from "@/lib/camera/cameraEvents";
import { notifyGuestActionBlocked } from "@/lib/guestBlocked";
import { StoryGalleryPicker } from "./story/StoryGalleryPicker";
import { InstagramCamera } from "./camera/InstagramCamera";
import { CameraCaptureShareScreen } from "./camera/CameraCaptureShareScreen";
import type { CameraComposeDraft } from "./chat/ChatCameraComposeModal";
import { REPORT_SHEET_OPEN_EVENT } from "@/lib/reportSheetChrome";
import { AppErrorBoundary } from "./AppErrorBoundary";
import {
  ChatTabPanel,
  HomeTabPanel,
  ProfileTabPanel,
  ReelsTabPanel,
  SearchTabPanel,
} from "./MainTabPanels";
import { apiBackendEnabled, getApiToken } from "@/lib/apiBackend";
import { logAuthRoute } from "@/lib/authRouteDebug";
import { isGuestUserId } from "@/lib/guestUser";
import { PROFILE_RETURN_POST_KEY, type ProfileReturnContext } from "@/lib/types";
import { useT } from "@/lib/i18n";
import { Home, Search, Camera, Plus, Menu, ChevronDown, ChevronRight, Heart, Lock, Footprints, EyeOff, ArrowRight } from "lucide-react";
import { BottomNavSheet } from "./BottomNavSheet";
import { useBottomNavDragContext } from "@/lib/bottomNavDragContext";
import { NAV_HIDE_PROGRESS_CSS_VAR } from "@/hooks/useBottomNavSheet";
import {
  BOTTOM_NAV_TAB_COUNT,
  navIndexToTab,
  tabToNavIndex,
  NAV_FLOAT_INSET_CSS_VAR,
  NAV_FLOAT_INSET_DEFAULT,
  NAV_SCROLL_PADDING_CSS_VAR,
  NAV_SCROLL_PADDING_DEFAULT,
} from "@/lib/bottomNavConfig";
import { DirectMessagesNavIcon } from "./icons/DirectMessagesNavIcon";
import { VerifiedMarkForUser } from "./VerifiedBadge";

/** أبيض صريح — مقاس الشريط */
const NAV_ICON = "pointer-events-none h-6 w-6 shrink-0 text-white";
const NAV_MSG_ICON = "pointer-events-none h-[26px] w-[26px] shrink-0 text-white";
import { HomeScreen } from "./screens/HomeScreen";
import { SearchScreen } from "./screens/SearchScreen";
import { ReelsScreen } from "./screens/ReelsScreen";
import { ChatScreen, CHAT_DISMISS_PULL_CSS_VAR } from "./screens/ChatScreen";
import { CHAT_STACK_PROGRESS_VAR } from "@/lib/chatStackGestureEngine";

import { ProfileScreen } from "./screens/ProfileScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { CreateScreen, type CreateScreenInitial } from "./screens/CreateScreen";
import { EditProfileScreen } from "./screens/EditProfileScreen";
import { AuthScreen } from "./screens/AuthScreen";
import { GuestBrowseProfilePrompt } from "./GuestBrowseProfilePrompt";
import { NotificationsPanel } from "./NotificationsPanel";
import { NotificationBanner } from "./NotificationBanner";
import { Avatar } from "./Avatar";
import { AccountSwitcherSheet } from "./rsocial/AccountSwitcherSheet";
import { cn } from "@/lib/utils";
import { nativeNoSelectCaptureHandlers } from "@/lib/nativeTextSelectionGuard";
import {
  ACCOUNT_SWITCHED_EVENT,
  ACCOUNT_SWITCH_FAILED_EVENT,
  countLoggedInAccountSessions,
  pruneStaleAccountSessions,
  resolveProfileTogglePeer,
} from "@/lib/accountSessions";
import { useNavDoubleTap } from "@/hooks/useNavDoubleTap";
import logo from "@/assets/logo.png";
import { BanScreen } from "./moderation/BanScreen";
import { apiGetMyModerationStatus } from "@/lib/moderationApi";
import type { BanInfo } from "@/lib/moderationBanTypes";
import { AccountRestoredScreen } from "./moderation/AccountRestoredScreen";

type Tab = "home" | "search" | "reels" | "chat" | "profile";
type Modal = null | "settings" | "create" | "edit" | "switcher" | "addAccount" | "notifications" | "visitors";

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
    logout,
  } = useApp();
  const t = useT();
  const [banInfo, setBanInfo] = useState<BanInfo | null>(null);
  const [appealPending, setAppealPending] = useState(false);
  const [restoredAppealId, setRestoredAppealId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("home");
  const [modal, setModal] = useState<Modal>(null);
  const [createInitial, setCreateInitial] = useState<CreateScreenInitial | null>(null);
  const [switchingAccountId, setSwitchingAccountId] = useState<string | null>(null);
  const [guestToast, setGuestToast] = useState(false);
  const [switchFailToast, setSwitchFailToast] = useState<string | null>(null);
  const [viewProfileId, setViewProfileId] = useState<string | null>(null);
  /** لمكدس الرجوع: فتح مستخدم من اقتراحات بروفايل ثم الرجوع يعيد الخطوة السابقة فقط */
  const [profileNavStack, setProfileNavStack] = useState<string[]>([]);
  /** التبويب الذي فتحنا منه بروفايل شخص آخر — للرجوع بدل الافتراض الخاطئ (محادثات) */
  const [profileReturnTargetTab, setProfileReturnTargetTab] = useState<Tab | null>(null);
  /** فُتحت المحادثة من بروفايل (مراسلة): الرجوع من الخيط يعيد نفس البروفايل */
  const [resumeProfileUserId, setResumeProfileUserId] = useState<string | null>(null);
  /** بروفايل فوق المحادثة دون تبديل التبويب — يمنع وميض الشاشة السوداء عند الرجوع */
  const [profileOverlayUserId, setProfileOverlayUserId] = useState<string | null>(null);
  const [openChatId, setOpenChatId] = useState<string | null>(null);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [chatThreadOpen, setChatThreadOpen] = useState(false);
  const [chatHideBottomNav, setChatHideBottomNav] = useState(false);
  /** سحب خروج المحادثة نشط — التقدّم في NAV_HIDE_PROGRESS_CSS_VAR (بدون setState كل إطار) */
  const [chatExitNavActive, setChatExitNavActive] = useState(false);
  const [postDetailOpen, setPostDetailOpen] = useState(false);
  const [reportSheetOpen, setReportSheetOpen] = useState(false);
  const [reelsCommentsOpen, setReelsCommentsOpen] = useState(false);
  const [chatCreateSheetOpen, setChatCreateSheetOpen] = useState(false);
  const [cameraFullscreenOpen, setCameraFullscreenOpen] = useState(false);
  const [storyGalleryOpen, setStoryGalleryOpen] = useState(false);
  const [storyInstagramCameraOpen, setStoryInstagramCameraOpen] = useState(false);
  const [storyCameraDraft, setStoryCameraDraft] = useState<CameraComposeDraft | null>(null);
  const [showWelcome, setShowWelcome] = useState(false);
  /** إعادة فتح منشور/تعليقات بعد الرجوع من بروفايل (لا يُفوَّض لحدث لأن الشاشة كانت مُزالة من الشجرة) */
  const [restorePostContext, setRestorePostContext] = useState<ProfileReturnContext | null>(null);
  const clearRestorePostContext = useCallback(() => setRestorePostContext(null), []);

  useEffect(() => {
    const onOpen = () => setPostDetailOpen(true);
    const onClose = () => setPostDetailOpen(false);
    window.addEventListener("retweet-post-detail-open", onOpen);
    window.addEventListener("retweet-post-detail-close", onClose);
    return () => {
      window.removeEventListener("retweet-post-detail-open", onOpen);
      window.removeEventListener("retweet-post-detail-close", onClose);
    };
  }, []);

  useEffect(() => {
    const onCamOpen = () => setCameraFullscreenOpen(true);
    const onCamClose = () => setCameraFullscreenOpen(false);
    window.addEventListener("retweet-camera-open", onCamOpen);
    window.addEventListener("retweet-camera-close", onCamClose);
    return () => {
      window.removeEventListener("retweet-camera-open", onCamOpen);
      window.removeEventListener("retweet-camera-close", onCamClose);
    };
  }, []);

  useEffect(() => {
    resetMediaChromeOverlays();
  }, []);

  const closeStoryGallery = useCallback(() => {
    setStoryGalleryOpen(false);
    notifyStoryPickerClose();
  }, []);

  const openStoryGallery = useCallback(() => {
    if (isGuest) {
      notifyGuestActionBlocked();
      return;
    }
    setStoryGalleryOpen(true);
    notifyStoryPickerOpen();
  }, [isGuest]);

  useEffect(() => {
    const onRequest = () => openStoryGallery();
    window.addEventListener(STORY_GALLERY_OPEN_EVENT, onRequest);
    return () => window.removeEventListener(STORY_GALLERY_OPEN_EVENT, onRequest);
  }, [openStoryGallery]);

  useEffect(() => {
    const onGoReels = () => setTab("reels");
    window.addEventListener("retweet-go-reels", onGoReels);
    return () => window.removeEventListener("retweet-go-reels", onGoReels);
  }, []);

  useEffect(() => {
    const onReportSheet = (e: Event) => {
      const open = (e as CustomEvent<{ open?: boolean }>).detail?.open;
      setReportSheetOpen(!!open);
    };
    window.addEventListener(REPORT_SHEET_OPEN_EVENT, onReportSheet);
    return () => window.removeEventListener(REPORT_SHEET_OPEN_EVENT, onReportSheet);
  }, []);

  useEffect(() => {
    const onReelsComments = (e: Event) => {
      const open = (e as CustomEvent<{ open?: boolean }>).detail?.open;
      setReelsCommentsOpen(!!open);
    };
    window.addEventListener("retweet-reels-comments-open", onReelsComments);
    return () => window.removeEventListener("retweet-reels-comments-open", onReelsComments);
  }, []);

  useEffect(() => {
    const onChatCreateSheet = (e: Event) => {
      const open = (e as CustomEvent<{ open?: boolean }>).detail?.open;
      setChatCreateSheetOpen(!!open);
    };
    window.addEventListener("retweet-chat-create-sheet", onChatCreateSheet);
    return () => window.removeEventListener("retweet-chat-create-sheet", onChatCreateSheet);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("subscription") !== "success") return;
    const sessionId = params.get("session_id");
    const paymentIntentId = params.get("payment_intent");
    if (!sessionId && !paymentIntentId) return;
    void (async () => {
      const { confirmStripeReturn } = await import("@/lib/subscriptionBilling");
      const { applyVerificationPayloadToUser } = await import("@/lib/verificationApi");
      const r = await confirmStripeReturn({ sessionId, paymentIntentId });
      if (r.ok && currentUser) {
        updateProfile(applyVerificationPayloadToUser(currentUser, r.data) as Partial<import("@/lib/types").User>, {
          commitRemote: false,
        });
        if (r.data.verificationStatus === "pending") {
          window.alert(
            "تم الدفع بنجاح. طلب التوثيق لدى فريق الدعم — سيتم إشعارك عند القبول أو الرفض.",
          );
        }
      }
      params.delete("subscription");
      params.delete("session_id");
      params.delete("payment_intent");
      params.delete("payment_intent_client_secret");
      params.delete("redirect_status");
      const q = params.toString();
      const path = window.location.pathname + (q ? `?${q}` : "");
      window.history.replaceState({}, "", path);
    })();
  }, [currentUser, updateProfile]);

  const closeProfileOverlay = useCallback(() => {
    setProfileOverlayUserId(null);
  }, []);

  const closeTopOverlay = useCallback(() => {
    if (modal) {
      setModal(null);
      setCreateInitial(null);
      return;
    }
    if (profileOverlayUserId) closeProfileOverlay();
  }, [modal, profileOverlayUserId, closeProfileOverlay]);

  useGlobalOverlayBack(!!modal || !!profileOverlayUserId, closeTopOverlay);

  /** تنقل تبويبات ثابت (بدون سحب أفقي — مؤقتاً لاستقرار الواجهة) */
  const resetChatNavigation = useCallback(() => {
    setOpenChatId(null);
    setActiveChatId(null);
    setChatThreadOpen(false);
    setChatHideBottomNav(false);
    setChatExitNavActive(false);
    setResumeProfileUserId(null);
    setProfileOverlayUserId(null);
    try {
      document.documentElement.style.removeProperty(CHAT_DISMISS_PULL_CSS_VAR);
      document.documentElement.style.removeProperty(CHAT_STACK_PROGRESS_VAR);
      document.documentElement.style.removeProperty(NAV_HIDE_PROGRESS_CSS_VAR);
      document.documentElement.style.removeProperty(SETTINGS_DISMISS_PULL_CSS_VAR);
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
    setProfileOverlayUserId(null);
    setRestorePostContext(null);
    if (next !== "chat") resetChatNavigation();
  }, [resetChatNavigation]);

  const [storyFullscreen, setStoryFullscreen] = useState(false);
  const settingsImmersive = modal === "settings";

  useEffect(() => {
    const onStoryFullscreen = (e: Event) => {
      const detail = (e as CustomEvent<{ open?: boolean; locks?: number }>).detail;
      const open = typeof detail?.locks === "number" ? detail.locks > 0 : Boolean(detail?.open);
      setStoryFullscreen(open);
    };
    window.addEventListener(STORY_FULLSCREEN_EVENT, onStoryFullscreen);
    return () => {
      window.removeEventListener(STORY_FULLSCREEN_EVENT, onStoryFullscreen);
      setStoryFullscreen(false);
    };
  }, []);

  useEffect(() => {
    if (!storyFullscreen) return;
    const t = window.setTimeout(() => {
      const stillOpen = document.documentElement.classList.contains("retweet-story-open");
      if (!stillOpen) setStoryFullscreen(false);
    }, 380);
    return () => window.clearTimeout(t);
  }, [storyFullscreen]);

  const navActiveIndex = tabToNavIndex(tab);

  const onNavSelectIndex = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(BOTTOM_NAV_TAB_COUNT - 1, Math.round(index)));
      const next = navIndexToTab(clamped);
      goTab(next);
    },
    [goTab],
  );

  const handleProfileNavDoubleTap = useCallback(() => {
    if (isGuest || accountSwitching || !currentUser) return;
    pruneStaleAccountSessions();
    if (countLoggedInAccountSessions() < 2) return;
    const peerId = resolveProfileTogglePeer(currentUser.id);
    if (!peerId || peerId === currentUser.id) return;
    void switchAccount(peerId);
  }, [isGuest, accountSwitching, currentUser, switchAccount]);

  useEffect(() => {
    if (!currentUser || isGuest || !apiBackendEnabled()) {
      setBanInfo(null);
      setAppealPending(false);
      setRestoredAppealId(null);
      return;
    }
    void apiGetMyModerationStatus().then(r => {
      if (!r.ok) {
        setBanInfo(null);
        setAppealPending(false);
        setRestoredAppealId(null);
        return;
      }
      setBanInfo(r.data.banInfo ?? null);
      setAppealPending(
        !!r.data.activeAppeal &&
          (r.data.activeAppeal.status === "pending" || r.data.activeAppeal.status === "under_review"),
      );
      const approvedId = r.data.latestAppeal?.status === "approved" ? r.data.latestAppeal.id : null;
      if (approvedId) {
        const shownKey = `retweet_restored_shown_${currentUser.id}_${approvedId}`;
        const alreadyShown = localStorage.getItem(shownKey) === "1";
        setRestoredAppealId(alreadyShown ? null : approvedId);
      } else {
        setRestoredAppealId(null);
      }
    });
    const onMod = (e: Event) => {
      const d = (e as CustomEvent).detail as { banInfo?: BanInfo; accountStatus?: string };
      if (d?.banInfo) setBanInfo(d.banInfo);
      if (d?.accountStatus === "ACTIVE") setBanInfo(null);
      if (d?.accountStatus === "ACTIVE") setAppealPending(false);
    };
    window.addEventListener("retweet-account-moderation", onMod);
    return () => window.removeEventListener("retweet-account-moderation", onMod);
  }, [currentUser?.id, isGuest]);

  useEffect(() => {
    const onSwitchFail = (e: Event) => {
      const msg = (e as CustomEvent<{ message?: string }>).detail?.message?.trim();
      setSwitchFailToast(msg || "تعذّر تبديل الحساب");
      window.setTimeout(() => setSwitchFailToast(null), 4200);
    };
    window.addEventListener(ACCOUNT_SWITCH_FAILED_EVENT, onSwitchFail);
    return () => window.removeEventListener(ACCOUNT_SWITCH_FAILED_EVENT, onSwitchFail);
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
        setProfileOverlayUserId(null);
        setProfileNavStack([]);
        setProfileReturnTargetTab(null);
        setViewProfileId(null);
        setTab("profile");
        return;
      }

      const openOverChatThread = tab === "chat" && !!activeChatId && !returnCtx;
      if (openOverChatThread) {
        setProfileOverlayUserId(id);
        setOpenChatId(activeChatId);
        setChatThreadOpen(true);
        setChatHideBottomNav(true);
        return;
      }

      setProfileOverlayUserId(null);

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
    [tab, viewProfileId, currentUser, activeChatId],
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
            if (rt && rt !== "profile") {
              if (rt === "chat" && activeChatId) setOpenChatId(activeChatId);
              setTab(rt);
            }
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
        if (nextTab === "chat" && activeChatId) {
          setOpenChatId(activeChatId);
          setChatThreadOpen(true);
          setChatHideBottomNav(true);
        } else if (nextTab !== "chat") {
          setOpenChatId(null);
          setChatThreadOpen(false);
          setChatHideBottomNav(false);
        }
        setTab(nextTab);
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

  useEffect(() => {
    if (modal === "settings") return;
    try {
      document.documentElement.style.removeProperty(SETTINGS_DISMISS_PULL_CSS_VAR);
    } catch {
      /* ignore */
    }
  }, [modal]);

  /** يجب أن تبقى كل الـ hooks قبل أي return — وإلا React #310 عند تبديل الحساب */
  const goChat = useCallback((chatId: string) => {
    setProfileOverlayUserId(null);
    setOpenChatId(chatId);
    setTab("chat");
    setViewProfileId(null);
    setProfileNavStack([]);
    setProfileReturnTargetTab(null);
    setResumeProfileUserId(null);
    setRestorePostContext(null);
  }, []);

  const onChatExitNavRevealProgress = useCallback((progress: number | null) => {
    if (progress == null) {
      setChatExitNavActive(false);
      try {
        document.documentElement.style.removeProperty(NAV_HIDE_PROGRESS_CSS_VAR);
      } catch {
        /* ignore */
      }
      return;
    }
    setChatExitNavActive(true);
    try {
      document.documentElement.style.setProperty(NAV_HIDE_PROGRESS_CSS_VAR, String(progress));
    } catch {
      /* ignore */
    }
  }, []);

  const openQuranChat = useCallback(() => {
    setOpenChatId(QURAN_CHANNEL_ID);
    setProfileReturnTargetTab(null);
    setResumeProfileUserId(null);
    setRestorePostContext(null);
    setTab("chat");
  }, []);

  const onExitThreadToProfile = useCallback((profileUserId: string) => {
    setResumeProfileUserId(null);
    setProfileOverlayUserId(profileUserId);
  }, []);

  const profilePanel = useMemo(() => {
    if (!currentUser) return null;
    if (tab === "profile" && !viewProfileId && isGuest) {
      return <GuestBrowseProfilePrompt onGoLogin={() => exitGuestBrowseMode()} />;
    }
    return (
      <ProfileScreen
        userId={viewProfileId || currentUser.id}
        suppressChrome={settingsImmersive}
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
  }, [
    currentUser,
    tab,
    viewProfileId,
    isGuest,
    settingsImmersive,
    profileNavStack.length,
    openProfile,
    popProfileScreenBack,
    openOrCreateChat,
    exitGuestBrowseMode,
  ]);

  const tabPanels = useMemo((): Record<PagerTab, React.ReactNode> => {
    if (!currentUser) {
      return { home: null, search: null, reels: null, chat: null, profile: null };
    }
    const chatImmersive = tab === "chat" && chatThreadOpen;
    return {
      home: (
        <HomeTabPanel
          onOpenProfile={openProfile}
          onOpenChat={goChat}
          restoreFromProfileContext={
            restorePostContext?.tab === "home" ? restorePostContext : null
          }
          onConsumedRestoreFromProfile={clearRestorePostContext}
        />
      ),
      search: (
        <SearchTabPanel
          onOpenProfile={openProfile}
          onOpenChat={goChat}
          onOpenQuranChat={openQuranChat}
          restoreFromProfileContext={
            restorePostContext?.tab === "search" ? restorePostContext : null
          }
          onConsumedRestoreFromProfile={clearRestorePostContext}
        />
      ),
      reels: (
        <ReelsTabPanel
          onOpenProfile={openProfile}
          onOpenChat={goChat}
          restoreFromProfileContext={
            restorePostContext?.tab === "reels" ? restorePostContext : null
          }
          onConsumedRestoreFromProfile={clearRestorePostContext}
        />
      ),
      chat: (
        <ChatTabPanel
          onOpenProfile={openProfile}
          initialChatId={openChatId}
          onConsumedInitialChat={() => setOpenChatId(null)}
          onThreadOpen={setChatThreadOpen}
          onHideBottomNav={setChatHideBottomNav}
          onExitNavRevealProgress={onChatExitNavRevealProgress}
          onActiveChatChange={setActiveChatId}
          resumeThreadToProfileUserId={resumeProfileUserId}
          onExitThreadToProfile={onExitThreadToProfile}
          chatImmersiveMode={chatImmersive}
        />
      ),
      profile: (
        <ProfileTabPanel lockScroll={!!viewProfileId}>
          {!settingsImmersive && profilePanel}
        </ProfileTabPanel>
      ),
    };
  }, [
    currentUser,
    tab,
    chatThreadOpen,
    chatHideBottomNav,
    openProfile,
    goChat,
    openQuranChat,
    restorePostContext,
    clearRestorePostContext,
    openChatId,
    resumeProfileUserId,
    onExitThreadToProfile,
    onChatExitNavRevealProgress,
    settingsImmersive,
    profilePanel,
    viewProfileId,
  ]);

  /** رسائل غير مقروءة — يُحدَّث لحظياً عند وصول رسالة أو فتح محادثة
   *  يجب أن يكون هنا (قبل أي return مشروط) حتى لا ينتهك قاعدة hooks */
  const unreadMessages = useMemo(() => {
    const meId = state.currentUserId;
    if (!meId || isGuestUserId(meId)) return 0;
    let count = 0;
    for (const chat of state.chats ?? []) {
      if (!Array.isArray(chat.members) || !chat.members.includes(meId)) continue;
      const msgs = chat.messages ?? [];
      count += msgs.filter(m => m.senderId !== meId && m.status !== "read").length;
    }
    return Math.min(count, 99);
  }, [state.chats, state.currentUserId]);

  if (!currentUser) {
    if (getApiToken() && apiBackendEnabled()) {
      return (
        <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6 text-center text-sm text-muted-foreground">
          <p className="font-medium text-foreground">جاري تحميل حسابك…</p>
          <p className="text-xs leading-relaxed">
            إن بقيت الشاشة بيضاء أكثر من ١٥ ثانية، حدّث الصفحة أو امسح الجلسة.
          </p>
          <button
            type="button"
            className="rounded-2xl border border-border bg-card px-5 py-2.5 text-sm font-medium text-foreground"
            onClick={() => {
              import("@/lib/uiErrorMessage").then(({ clearRetweetLocalSession }) => {
                clearRetweetLocalSession();
                window.location.reload();
              });
            }}
          >
            مسح الجلسة وإعادة المحاولة
          </button>
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
        className="flex min-h-dvh flex-col items-center justify-center bg-black px-6"
      >
        <div className="relative">
          <div className="h-24 w-24 rounded-full border border-white/15 border-t-white/70 animate-spin" />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <img
              src={logo}
              alt="Retweet"
              className="h-14 w-14 select-none dark:invert animate-pulse"
              draggable={false}
            />
          </div>
        </div>
      </div>
    );
  }

  if (restoredAppealId && currentUser && !isGuest) {
    return (
      <AccountRestoredScreen
        onContinue={() => {
          const shownKey = `retweet_restored_shown_${currentUser.id}_${restoredAppealId}`;
          localStorage.setItem(shownKey, "1");
          setRestoredAppealId(null);
        }}
      />
    );
  }

  if (banInfo && !isGuest) {
    return (
      <BanScreen
        banInfo={banInfo}
        hasPendingAppeal={appealPending}
        onAppealSubmitted={() => setAppealPending(true)}
        onLogout={() => logout()}
      />
    );
  }

  const unreadNotifs = (state.notifications ?? []).filter(
    n => n.userId === currentUser.id && !n.read && n.type !== "message",
  ).length;
  const showChatThreadChrome = tab === "chat" && chatThreadOpen;
  /** محادثة مفتوحة — إخفاء الشريط السفلي وملء الشاشة (يُحدَّث من ChatScreen عبر onThreadOpen) */
  /** أثناء السحب التفاعلي يبقى الشريط السفلي ظاهراً ويتحرك عبر NAV_HIDE_PROGRESS */
  const chatImmersiveMode =
    tab === "chat" && chatThreadOpen && !chatExitNavActive;
  const postImmersiveMode = postDetailOpen;
  const immersiveOverlay = chatImmersiveMode || postImmersiveMode;

  const pagerEnabled =
    !chatImmersiveMode &&
    !storyFullscreen &&
    !profileOverlayUserId &&
    !settingsImmersive &&
    !postDetailOpen &&
    // إذا كان المستخدم يشاهد بروفايل شخص آخر (inline) — أوقف سحب التبويبات
    !(viewProfileId && viewProfileId !== currentUser.id);

  const onProfileTab = tab === "profile" && !viewProfileId;
  const viewingOtherUserProfile = tab === "profile" && !!viewProfileId;
  const hideAppHeader =
    tab === "chat" ||
    tab === "search" ||
    tab === "reels" ||
    onProfileTab ||
    viewingOtherUserProfile ||
    storyFullscreen ||
    postDetailOpen ||
    settingsImmersive;
  const hideBottomBar =
    (immersiveOverlay && !chatExitNavActive) ||
    storyFullscreen ||
    !!profileOverlayUserId ||
    settingsImmersive ||
    reportSheetOpen ||
    reelsCommentsOpen ||
    chatCreateSheetOpen ||
    cameraFullscreenOpen ||
    storyGalleryOpen;
  const showBottomNav = !hideBottomBar || chatExitNavActive;

  return (
    <div
      key={accountSessionKey}
      className={
        "retweet-no-select-pane select-none relative mx-auto flex w-full max-w-md flex-col overflow-x-hidden overscroll-none bg-background supports-[height:100dvh] " +
        (immersiveOverlay || settingsImmersive
          ? "h-dvh max-h-dvh overflow-hidden pt-0"
          : "h-dvh max-h-dvh overflow-hidden pt-[var(--sat,0px)]")
      }
      style={
        {
          [NAV_FLOAT_INSET_CSS_VAR]: NAV_FLOAT_INSET_DEFAULT,
          [NAV_SCROLL_PADDING_CSS_VAR]: NAV_SCROLL_PADDING_DEFAULT,
        } as CSSProperties
      }
      {...nativeNoSelectCaptureHandlers}
    >
      {guestToast && (
        <div className="fixed left-3 right-3 top-[max(0.75rem,var(--sat,0px))] z-[500] mx-auto max-w-md rounded-2xl border border-border bg-card px-4 py-3 text-start text-sm shadow-lg">
          سجّل الدخول أو أنشئ حساباً لاستخدام هذه الميزة (إعجاب، رسائل، متابعة…).
        </div>
      )}
      {switchFailToast && (
        <div className="fixed left-3 right-3 top-[max(0.75rem,var(--sat,0px))] z-[501] mx-auto max-w-md rounded-2xl border border-destructive/40 bg-card px-4 py-3 text-start text-sm text-destructive shadow-lg">
          {switchFailToast}
        </div>
      )}
      {!storyFullscreen && !immersiveOverlay && !settingsImmersive && <NotificationBanner />}
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
                transform: `translate3d(calc(var(${CHAT_STACK_PROGRESS_VAR}, 0) * 18%), 0, 0)`,
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

      <div className="relative flex min-h-0 flex-1 flex-col">
        <main
          className={
            "flex min-h-0 flex-1 flex-col overflow-hidden break-words text-start " +
            (chatImmersiveMode ? "" : "")
          }
        >
          <AppErrorBoundary key={accountSessionKey} label="main-tabs">
            <MainTabStack
              activeTab={tab as PagerTab}
              swipeEnabled={pagerEnabled}
              onTabChange={goTab}
              panels={tabPanels}
            />
          </AppErrorBoundary>
        </main>

        {showBottomNav && (
          <BottomNavSheet
            progressIndex={navActiveIndex}
            onSelectTabIndex={onNavSelectIndex}
            externalHideDrive={chatExitNavActive}
          >
            <NavBtn tabIndex={0} onClick={() => onNavSelectIndex(0)}>
              <Home className={NAV_ICON} strokeWidth={2} />
            </NavBtn>
            <NavBtn tabIndex={1} onClick={() => onNavSelectIndex(1)}>
              <Search className={NAV_ICON} strokeWidth={2} />
            </NavBtn>
            <NavBtn
              tabIndex={2}
              suppressRowSelect
              onClick={() => setStoryInstagramCameraOpen(true)}
            >
              <Camera className={NAV_ICON} strokeWidth={2} />
            </NavBtn>
            <NavBtn tabIndex={3} onClick={() => onNavSelectIndex(3)}>
              <div className="relative">
                <DirectMessagesNavIcon className={NAV_MSG_ICON} strokeWidth={2} />
                {unreadMessages > 0 && (
                  <span
                    className="pointer-events-none absolute -top-1.5 -right-1.5 flex min-w-[16px] h-4 items-center justify-center rounded-full px-[3px] text-[10px] font-bold leading-none text-white"
                    style={{ backgroundColor: "#FF3B30" }}
                  >
                    {unreadMessages > 9 ? "9+" : unreadMessages}
                  </span>
                )}
              </div>
            </NavBtn>
            <ProfileNavBtn
              tabIndex={4}
              onSingleTap={() => onNavSelectIndex(4)}
              onDoubleTap={handleProfileNavDoubleTap}
            >
              <Avatar
                name={currentUser.username}
                src={currentUser.avatar}
                size={26}
                className={cn(
                  "pointer-events-none shrink-0 border-2",
                  navActiveIndex === 4 ? "border-white" : "border-white/35",
                )}
              />
            </ProfileNavBtn>
          </BottomNavSheet>
        )}
      </div>

      {profileOverlayUserId && (
            <ProfileScreen
              userId={profileOverlayUserId}
              suppressChrome={settingsImmersive}
              dismissPresentation="overlay"
              dismissOverlayZIndex={280}
              showSuggestAccountsEntry
              onOpenProfile={id => {
                if (id === currentUser.id) {
                  closeProfileOverlay();
                  setViewProfileId(null);
                  setTab("profile");
                  return;
                }
                setProfileOverlayUserId(id);
              }}
              onOpenExistingChat={chatId => {
                closeProfileOverlay();
                setOpenChatId(chatId);
                setChatThreadOpen(true);
                setChatHideBottomNav(true);
              }}
              onOpenChannel={chatId => {
                closeProfileOverlay();
                setOpenChatId(chatId);
                setChatThreadOpen(true);
                setChatHideBottomNav(true);
              }}
              onBack={closeProfileOverlay}
              onEdit={() => {
                closeProfileOverlay();
                setModal("edit");
              }}
              onOpenAccountSwitcher={isGuest ? undefined : () => {
                closeProfileOverlay();
                setModal("switcher");
              }}
              onOpenSettings={isGuest ? undefined : () => {
                closeProfileOverlay();
                setModal("settings");
              }}
              onOpenVisitors={isGuest ? undefined : () => {
                closeProfileOverlay();
                setModal("visitors");
              }}
              onOpenChat={targetUserId => {
                if (targetUserId === currentUser.id) return;
                const ch = openOrCreateChat(targetUserId);
                if (!ch) {
                  if (isGuest) notifyGuestActionBlocked();
                  else
                    window.alert("تعذّر فتح المحادثة. أعد المحاولة أو حدّث الصفحة إن استمرت المشكلة.");
                  return;
                }
                closeProfileOverlay();
                setOpenChatId(ch.id);
                setChatThreadOpen(true);
                setChatHideBottomNav(true);
              }}
            />
      )}

      {/* مؤقتاً: عارض ستوري عام من App (يُعاد عبر storyChrome لاحقاً) */}

      {modal === "settings" && (
        <AppDismissSheet
          onClose={() => {
            try {
              document.documentElement.style.removeProperty(SETTINGS_DISMISS_PULL_CSS_VAR);
            } catch {
              /* ignore */
            }
            setModal(null);
          }}
          overlayZIndex={120}
          dismissPullCssVar={SETTINGS_DISMISS_PULL_CSS_VAR}
          darkPanelChrome={state.theme === "dark"}
          contentClassName="min-h-dvh bg-background text-foreground"
        >
          <AppErrorBoundary label="settings-screen">
            <SettingsScreen
              onBack={() => setModal(null)}
              onOpenAccounts={() => {
                setModal("switcher");
              }}
            />
          </AppErrorBoundary>
        </AppDismissSheet>
      )}
      {modal === "create" && (
        <AppDismissSheet
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
        </AppDismissSheet>
      )}
      {modal === "edit" && (
        <AppDismissSheet onClose={() => setModal(null)}>
          <EditProfileScreen onBack={() => setModal(null)} />
        </AppDismissSheet>
      )}
      {modal === "notifications" && (
        <NotificationsPanel onClose={() => setModal(null)} onOpenProfile={openProfile} onOpenChat={goChat} />
      )}
      {modal === "visitors" && (
        <AppDismissSheet onClose={() => setModal(null)} contentClassName="bg-background">
          <div className="p-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              <SlideDismissBackButton
                onDismiss={() => setModal(null)}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground px-3 py-2 rounded-full hover:bg-secondary active:scale-[0.98] transition"
                aria-label="رجوع"
              >
                <ArrowRight size={18} aria-hidden />
                رجوع
              </SlideDismissBackButton>
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
        </AppDismissSheet>
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
        <AppDismissSheet onClose={() => setModal(null)} overlayZIndex={250} contentClassName="bg-background flex flex-col">
          <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-background p-3">
            <SlideDismissBackButton
              onDismiss={() => setModal(null)}
              className="rounded-full px-2 py-1 text-sm font-semibold text-primary hover:bg-secondary"
            >
              {t("cancel")}
            </SlideDismissBackButton>
            <span className="flex-1 text-center text-sm font-semibold">إضافة حساب</span>
            <span className="w-16" />
          </div>
          <AuthScreen onAuthSuccess={() => setModal(null)} allowGuestBrowse={false} />
        </AppDismissSheet>
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

      <StoryGalleryPicker
        open={storyGalleryOpen}
        language={state.language}
        onClose={closeStoryGallery}
        onOpenCamera={() => {
          closeStoryGallery();
          setStoryInstagramCameraOpen(true);
        }}
        onPickDraft={draft => {
          closeStoryGallery();
          setStoryCameraDraft(draft);
        }}
      />
      <InstagramCamera
        open={storyInstagramCameraOpen}
        language={state.language}
        onClose={() => setStoryInstagramCameraOpen(false)}
        onCapture={cap => {
          setStoryInstagramCameraOpen(false);
          setStoryCameraDraft({ kind: cap.kind, dataUrl: cap.dataUrl });
        }}
      />
      {storyCameraDraft && (
        <CameraCaptureShareScreen
          draft={storyCameraDraft}
          language={state.language}
          onClose={() => setStoryCameraDraft(null)}
        />
      )}
    </div>
  );
}

const NavBtn = memo(function NavBtn({
  tabIndex = 0,
  suppressRowSelect = false,
  onClick,
  children,
}: {
  tabIndex?: number;
  suppressRowSelect?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const { shouldSuppressTap } = useBottomNavDragContext();

  const fire = useCallback(() => {
    if (shouldSuppressTap()) return;
    onClick();
  }, [onClick, shouldSuppressTap]);

  return (
    <button
      type="button"
      data-nav-tab-btn
      data-nav-tab-index={tabIndex}
      data-nav-suppress-row-select={suppressRowSelect ? "true" : "false"}
      onPointerDown={e => {
        if (!suppressRowSelect) return;
        e.stopPropagation();
      }}
      onPointerUp={e => {
        if (!suppressRowSelect) return;
        e.stopPropagation();
      }}
      onPointerCancel={e => {
        if (!suppressRowSelect) return;
        e.stopPropagation();
      }}
      onClick={e => {
        e.stopPropagation();
        fire();
      }}
      className="relative z-10 flex h-11 w-11 shrink-0 touch-none select-none items-center justify-center text-white active:scale-[0.92]"
    >
      {children}
    </button>
  );
});

/** تبويب البروفايل: نقرة = الملف؛ نقرتان سريعتان = التبديل بين آخر حسابين */
const ProfileNavBtn = memo(function ProfileNavBtn({
  tabIndex = 4,
  onSingleTap,
  onDoubleTap,
  children,
}: {
  tabIndex?: number;
  onSingleTap: () => void;
  onDoubleTap: () => void;
  children: React.ReactNode;
}) {
  const { shouldSuppressTap } = useBottomNavDragContext();

  const handleTap = useNavDoubleTap(
    useCallback(() => {
      if (shouldSuppressTap()) return;
      onSingleTap();
    }, [onSingleTap, shouldSuppressTap]),
    useCallback(() => {
      if (shouldSuppressTap()) return;
      onDoubleTap();
    }, [onDoubleTap, shouldSuppressTap]),
  );

  return (
    <button
      type="button"
      data-nav-tab-btn
      data-nav-tab-index={tabIndex}
      onClick={e => {
        e.stopPropagation();
        handleTap();
      }}
      className="relative z-10 flex h-11 w-11 shrink-0 touch-none select-none items-center justify-center text-white active:scale-[0.92]"
      aria-label="الملف الشخصي"
    >
      {children}
    </button>
  );
});

