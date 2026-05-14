import { useEffect, useState, startTransition } from "react";
import { QURAN_CHANNEL_ID, useApp, userById } from "@/lib/store";
import { isGuestUserId } from "@/lib/guestUser";
import { PROFILE_RETURN_POST_KEY, type ProfileReturnContext } from "@/lib/types";
import { useT } from "@/lib/i18n";
import { Home, Search, MessageCircle, PlayCircle as ReelsIcon, Plus, Menu, ChevronDown, ChevronRight, Heart, Lock, User, Footprints, EyeOff, ArrowRight } from "lucide-react";
import { VerifiedMarkForUser } from "./VerifiedBadge";
import { HomeScreen } from "./screens/HomeScreen";
import { SearchScreen } from "./screens/SearchScreen";
import { ReelsScreen } from "./screens/ReelsScreen";
import { ChatScreen } from "./screens/ChatScreen";
import { ProfileScreen } from "./screens/ProfileScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { CreateScreen } from "./screens/CreateScreen";
import { EditProfileScreen } from "./screens/EditProfileScreen";
import { AuthScreen } from "./screens/AuthScreen";
import { GuestBrowseProfilePrompt } from "./GuestBrowseProfilePrompt";
import { notifyGuestActionBlocked } from "@/lib/guestBlocked";
import { NotificationsPanel } from "./NotificationsPanel";
import { NotificationBanner } from "./NotificationBanner";
import { Avatar } from "./Avatar";
import logo from "@/assets/logo.png";

type Tab = "home" | "search" | "reels" | "chat" | "profile";
type Modal = null | "settings" | "create" | "edit" | "switcher" | "addAccount" | "notifications" | "visitors";

export function App() {
  const { state, currentUser, switchAccount, createSticker, openOrCreateChat, updateProfile, isGuest, exitGuestBrowseMode } = useApp();
  const t = useT();
  const [tab, setTab] = useState<Tab>("home");
  const [modal, setModal] = useState<Modal>(null);
  const [guestToast, setGuestToast] = useState(false);
  const [viewProfileId, setViewProfileId] = useState<string | null>(null);
  const [openChatId, setOpenChatId] = useState<string | null>(null);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [chatThreadOpen, setChatThreadOpen] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);

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
    };
    window.addEventListener("retweet-open-chat", onOpenChat);
    return () => window.removeEventListener("retweet-open-chat", onOpenChat);
  }, []);

  useEffect(() => {
    const closeModals = () => setModal(null);
    window.addEventListener("retweet-close-modals", closeModals);
    return () => window.removeEventListener("retweet-close-modals", closeModals);
  }, []);

  useEffect(() => {
    const onGuestBlock = () => {
      setGuestToast(true);
      window.setTimeout(() => setGuestToast(false), 2400);
    };
    window.addEventListener("retweet-guest-blocked", onGuestBlock);
    return () => window.removeEventListener("retweet-guest-blocked", onGuestBlock);
  }, []);

  if (!currentUser) {
    return <AuthScreen />;
  }

  const openProfile = (id: string, returnCtx?: ProfileReturnContext) => {
    try {
      if (returnCtx) sessionStorage.setItem(PROFILE_RETURN_POST_KEY, JSON.stringify(returnCtx));
      else sessionStorage.removeItem(PROFILE_RETURN_POST_KEY);
    } catch {
      /* ignore */
    }
    setViewProfileId(id);
    setTab("profile");
  };
  const goChat = (chatId: string) => {
    setOpenChatId(chatId);
    setTab("chat");
    setViewProfileId(null);
  };
  const unreadNotifs = state.notifications.filter(n => n.userId === currentUser.id && !n.read).length;

  const screen = (() => {
    if (tab === "profile" && !viewProfileId && isGuest) {
      return <GuestBrowseProfilePrompt onGoLogin={() => exitGuestBrowseMode()} />;
    }
    if (tab === "profile") {
      const id = viewProfileId || currentUser.id;
      return (
        <ProfileScreen
          userId={id}
          onOpenProfile={openProfile}
          onOpenExistingChat={chatId => {
            setOpenChatId(chatId);
            setTab("chat");
            setViewProfileId(null);
          }}
          onOpenChannel={(chatId) => {
            setOpenChatId(chatId);
            setTab("chat");
            setViewProfileId(null);
          }}
          onBack={viewProfileId && viewProfileId !== currentUser.id ? () => {
            const pendingStoryOwner = typeof window !== "undefined" ? sessionStorage.getItem("retweet_return_story_user_id") : null;
            const pendingPostRaw = typeof window !== "undefined" ? sessionStorage.getItem(PROFILE_RETURN_POST_KEY) : null;
            if (pendingPostRaw) {
              try {
                const ctx = JSON.parse(pendingPostRaw) as ProfileReturnContext;
                sessionStorage.removeItem(PROFILE_RETURN_POST_KEY);
                if (ctx.tab === "profile" && ctx.profileUserId) {
                  startTransition(() => {
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
                  setViewProfileId(null);
                  setTab(ctx.tab);
                });
                queueMicrotask(() => {
                  try {
                    window.dispatchEvent(new CustomEvent("retweet-restore-post", { detail: ctx }));
                  } catch {
                    /* ignore */
                  }
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
            startTransition(() => {
              setViewProfileId(null);
              if (pendingStoryOwner) {
                try {
                  window.dispatchEvent(new CustomEvent("retweet-open-story", { detail: { userId: pendingStoryOwner } }));
                  sessionStorage.removeItem("retweet_return_story_user_id");
                } catch {
                  /* ignore */
                }
                setTab("home");
                return;
              }
              setTab("chat");
            });
            if (!pendingStoryOwner) {
              queueMicrotask(() => {
                if (activeChatId) setOpenChatId(activeChatId);
              });
            }
          } : undefined}
          onEdit={() => setModal("edit")}
          onOpenChat={(targetUserId) => {
            if (targetUserId === currentUser.id) return;
            const ch = openOrCreateChat(targetUserId);
            if (!ch) {
              if (isGuest) notifyGuestActionBlocked();
              else
                window.alert("تعذّر فتح المحادثة. أعد المحاولة أو حدّث الصفحة إن استمرت المشكلة.");
              return;
            }
            setOpenChatId(ch.id);
            setTab("chat");
          }}
        />
      );
    }
    if (tab === "home") return <HomeScreen onOpenProfile={openProfile} onOpenChat={goChat} />;
    if (tab === "search") return <SearchScreen onOpenProfile={openProfile} onOpenChat={goChat} onOpenQuranChat={() => { setOpenChatId(QURAN_CHANNEL_ID); setTab("chat"); }} />;
    if (tab === "reels") return <ReelsScreen onOpenProfile={openProfile} onOpenChat={goChat} />;
    if (tab === "chat") return (
      <ChatScreen
        onOpenProfile={openProfile}
        initialChatId={openChatId}
        onConsumedInitialChat={() => setOpenChatId(null)}
        onThreadOpen={setChatThreadOpen}
        onActiveChatChange={setActiveChatId}
      />
    );
    return null;
  })();

  const onProfileTab = tab === "profile" && !viewProfileId;

  return (
    <div className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col overflow-x-hidden overscroll-none bg-background pt-[env(safe-area-inset-top,0px)] supports-[height:100dvh]:min-h-dvh [-webkit-overflow-scrolling:touch]">
      {guestToast && (
        <div className="fixed left-3 right-3 top-[max(0.75rem,env(safe-area-inset-top,0px))] z-[500] mx-auto max-w-md rounded-2xl border border-border bg-card px-4 py-3 text-start text-sm shadow-lg">
          سجّل الدخول أو أنشئ حساباً لاستخدام هذه الميزة (إعجاب، رسائل، متابعة…).
        </div>
      )}
      <NotificationBanner />
      {!chatThreadOpen && <header className="sticky top-0 bg-background/90 backdrop-blur z-30 border-b border-border px-4 py-3">
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
      </header>}

      <main className={`min-h-0 flex-1 break-words text-start ${chatThreadOpen ? "pb-4" : "pb-[calc(5.25rem+env(safe-area-inset-bottom,0px))]"}`}>{screen}</main>

      <nav
        dir="ltr"
        className={
          "pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] " +
          (chatThreadOpen ? "hidden" : "")
        }
      >
        <div className="pointer-events-auto w-full max-w-md">
        <div className="h-20 rounded-[2rem] bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl border border-white/50 dark:border-zinc-700 shadow-[0_10px_30px_rgba(0,0,0,0.16)] flex flex-row items-center justify-around">
          <NavBtn active={tab === "home"} onClick={() => { setTab("home"); setViewProfileId(null); }}>
            <Home />
          </NavBtn>
          <NavBtn active={tab === "search"} onClick={() => setTab("search")}><Search /></NavBtn>
          <NavBtn active={tab === "reels"} onClick={() => setTab("reels")}><ReelsIcon /></NavBtn>
          <NavBtn active={tab === "chat"} onClick={() => setTab("chat")}><MessageCircle /></NavBtn>
          <NavBtn active={onProfileTab} onClick={() => { setTab("profile"); setViewProfileId(null); }}><User /></NavBtn>
        </div>
        </div>
      </nav>

      {modal === "settings" && <Sheet onClose={() => setModal(null)}>
        <SettingsScreen onBack={() => setModal(null)} onAccountInfo={() => { /* shown inline */ }} />
      </Sheet>}
      {modal === "create" && <Sheet onClose={() => setModal(null)}><CreateScreen onBack={() => setModal(null)} /></Sheet>}
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
        <div className="fixed inset-0 bg-black/50 z-[200] flex items-start justify-center pt-14 px-3 pointer-events-auto" onClick={() => setModal(null)}>
          <div className="bg-background rounded-3xl w-full max-w-sm p-4 shadow-xl border border-border pointer-events-auto" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-center mb-3">{t("accounts")}</h3>
            <p className="text-xs text-muted-foreground text-center mb-3">اضغط حساباً للتبديل إليه فوراً</p>
            <div className="space-y-1 max-h-[50vh] overflow-y-auto">
              {state.accountIds.filter((id) => !isGuestUserId(id)).map((id) => {
                const u = userById(state, id); if (!u) return null;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => { switchAccount(id); setModal(null); }}
                    className="w-full flex items-center gap-3 p-3 hover:bg-secondary rounded-2xl text-start min-h-[52px]"
                  >
                    <Avatar name={u.username} src={u.avatar} size={44} />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold truncate flex items-center gap-1">
                        @{u.username}
                        <VerifiedMarkForUser user={u} size={16} />
                      </div>
                      <div className="text-xs text-muted-foreground truncate">{u.bio || "—"}</div>
                    </div>
                    {id === currentUser.id && <span className="text-primary text-sm shrink-0">✓</span>}
                  </button>
                );
              })}
            </div>
            <div className="mt-4 pt-3 border-t border-border space-y-2">
              <button type="button" onClick={() => { setModal("addAccount"); }} className="w-full py-3 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm">
                تسجيل دخول / إضافة حساب آخر
              </button>
            </div>
          </div>
        </div>
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

function NavBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "w-14 h-14 shrink-0 touch-manipulation select-none rounded-full flex items-center justify-center " +
        "transition-[transform,background-color,color] duration-200 ease-[cubic-bezier(0.25,0.1,0.25,1)] " +
        (active
          ? "bg-zinc-100 dark:bg-zinc-800 text-blue-500 scale-[1.02]"
          : "text-black dark:text-zinc-100 active:scale-[0.88]")
      }
    >
      {children}
    </button>
  );
}

function Sheet({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose}>
      <div className="absolute inset-0 max-w-md mx-auto bg-background overflow-y-auto" onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
