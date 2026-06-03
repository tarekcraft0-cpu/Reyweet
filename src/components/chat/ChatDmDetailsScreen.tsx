import { useEffect, useMemo, useState, type ReactNode } from "react";
import { resetMobileViewportAfterKeyboard } from "@/lib/nativeViewportLayout";
import {
  ArrowRight,
  Bell,
  BellOff,
  ChevronRight,
  Clock,
  Image as ImageIcon,
  MessageCircleWarning,
  MoreHorizontal,
  Search,
  Shield,
  UserCircle,
} from "lucide-react";
import { Avatar } from "../Avatar";
import { VerifiedMarkForUser } from "../VerifiedBadge";
import { useApp } from "@/lib/store";
import { useT } from "@/lib/i18n";
import type { Chat, Message, User } from "@/lib/types";
import { resolveMediaUrl } from "@/lib/mediaUrl";
import {
  chatWallpaperLabel,
  getChatWallpaperTheme,
  loadChatWallpaperForChat,
} from "@/lib/chatWallpaperThemes";
import { messageContent } from "@/lib/chatNormalize";

type SubView = "search" | null;

/** شريط علوي بسيط — سهم رجوع خطوة واحدة للخلف فقط (بدون مكالمات) */
function DmDetailsBackHeader({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex shrink-0 items-center border-b border-border px-3 py-2.5 pt-[max(0.75rem,var(--sat))]">
      <button
        type="button"
        onClick={onBack}
        aria-label="رجوع"
        className="flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-full text-foreground hover:bg-secondary active:bg-secondary/80"
      >
        <ArrowRight size={24} strokeWidth={2} />
      </button>
    </div>
  );
}

function ThemeGradientIcon() {
  return (
    <span
      className="inline-block h-5 w-5 rounded-full bg-gradient-to-br from-[#833AB4] via-[#FD1D1D] to-[#F77737]"
      aria-hidden
    />
  );
}

function messagePreview(m: Message): string {
  if (m.type === "text") return messageContent(m) || "";
  if (m.shareText?.trim()) return m.shareText;
  if (m.type === "image") return "صورة";
  if (m.type === "video") return "فيديو";
  if (m.type === "audio") return "رسالة صوتية";
  if (m.type === "sticker") return "ملصق";
  return `[${m.type}]`;
}

export function ChatDmDetailsScreen({
  chat,
  peer,
  messages,
  onBack,
  onOpenProfile,
  onOpenChatTheme,
  onScrollToMessage,
  isMuted,
  onToggleMute,
  onRegisterPopStep,
}: {
  chat: Chat;
  peer: User;
  messages: Message[];
  onBack: () => void;
  onOpenProfile: (userId: string) => void;
  onOpenChatTheme?: () => void;
  onScrollToMessage: (messageId: string) => void;
  isMuted: boolean;
  onToggleMute: () => void;
  /** يُستدعى عند الرجوع خطوة واحدة (بحث → التفاصيل) قبل إغلاق الشاشة */
  onRegisterPopStep?: (pop: () => boolean) => void;
}) {
  const { state, currentUser } = useApp();
  const t = useT();
  const me = currentUser!;
  const [subView, setSubView] = useState<SubView>(null);
  const [searchQ, setSearchQ] = useState("");
  const [showOptions, setShowOptions] = useState(false);

  const themeSubtitle = chatWallpaperLabel(
    getChatWallpaperTheme(loadChatWallpaperForChat(chat, me.id)),
    state.language,
  );

  const searchHits = useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    if (!q) return [];
    return messages
      .filter(m => {
        const body = messagePreview(m).toLowerCase();
        return body.includes(q);
      })
      .slice(-50)
      .reverse();
  }, [messages, searchQ]);

  const sharedMedia = useMemo(
    () =>
      messages
        .filter(m => m.type === "image" || m.type === "video")
        .slice(-36)
        .reverse(),
    [messages],
  );

  const actionBtn = (icon: ReactNode, label: string, onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      className="flex min-w-[4.25rem] flex-1 flex-col items-center gap-2 px-1 py-1 text-[11px] font-medium text-foreground"
    >
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-secondary text-foreground">
        {icon}
      </span>
      {label}
    </button>
  );

  const menuRow = (icon: ReactNode, title: string, subtitle: string | undefined, onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 border-b border-border/60 px-4 py-3.5 text-start last:border-0 hover:bg-secondary/50 active:bg-secondary/80"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center text-foreground">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-normal text-foreground">{title}</span>
        {subtitle ? (
          <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">{subtitle}</span>
        ) : null}
      </span>
      <ChevronRight size={18} className="shrink-0 text-muted-foreground rtl:rotate-180" />
    </button>
  );

  const exitToChat = () => {
    resetMobileViewportAfterKeyboard();
    setSubView(null);
    setSearchQ("");
    setShowOptions(false);
    onBack();
  };

  const jumpToMessage = (messageId: string) => {
    resetMobileViewportAfterKeyboard();
    setSubView(null);
    setSearchQ("");
    setShowOptions(false);
    onBack();
    window.setTimeout(() => onScrollToMessage(messageId), 0);
  };

  const closeSearch = () => {
    setSubView(null);
    setSearchQ("");
    resetMobileViewportAfterKeyboard();
  };

  useEffect(() => {
    if (!onRegisterPopStep) return;
    onRegisterPopStep(() => {
      if (showOptions) {
        setShowOptions(false);
        return true;
      }
      if (subView === "search") {
        closeSearch();
        return true;
      }
      return false;
    });
    return () => onRegisterPopStep(() => false);
  }, [subView, showOptions, onRegisterPopStep]);

  if (subView === "search") {
    return (
      <div className="flex h-full min-h-0 max-w-full flex-col overflow-hidden bg-background text-foreground">
        <DmDetailsBackHeader onBack={closeSearch} />
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain px-4 py-3">
          <div className="mb-3 flex items-center gap-2 rounded-xl bg-input px-3 py-2.5">
            <Search size={18} className="shrink-0 text-muted-foreground" />
            <input
              type="search"
              inputMode="search"
              enterKeyHint="search"
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
              placeholder={state.language === "en" ? "Search messages…" : "ابحث في الرسائل…"}
              className="min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>
          {!searchQ.trim() ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {state.language === "en"
                ? "Type to find a message in this chat"
                : "اكتب للبحث عن رسالة في هذه المحادثة"}
            </p>
          ) : searchHits.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {state.language === "en" ? "No results" : "لا نتائج"}
            </p>
          ) : (
            <div className="space-y-2">
              {searchHits.map(m => (
                <button
                  key={m.id}
                  type="button"
                  className="flex w-full flex-col gap-1 rounded-2xl border border-border bg-card px-4 py-3 text-start active:bg-secondary/80"
                  onClick={() => jumpToMessage(m.id)}
                >
                  <span className="text-xs text-muted-foreground">
                    {new Date(m.createdAt).toLocaleString(state.language === "en" ? "en" : "ar", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </span>
                  <span className="line-clamp-3 text-[15px] leading-snug text-foreground">
                    {messagePreview(m)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 max-w-full flex-col overflow-hidden bg-background text-foreground">
      <DmDetailsBackHeader onBack={exitToChat} />

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain pb-[max(1.5rem,var(--sab))]">
        <div className="px-4 pb-2 pt-4 text-center">
          <button type="button" onClick={() => onOpenProfile(peer.id)} className="mx-auto block">
            <Avatar name={peer.username} src={peer.avatar} size={96} className="mx-auto" />
          </button>
          <div className="mt-3 flex items-center justify-center gap-1.5">
            <h1 className="text-xl font-bold text-foreground">@{peer.username}</h1>
            <VerifiedMarkForUser user={peer} size={18} />
          </div>
          {peer.displayName?.trim() ? (
            <p className="mt-1 text-sm text-muted-foreground">{peer.displayName}</p>
          ) : null}
        </div>

        <div className="flex justify-between gap-1 px-3 pb-5 pt-1">
          {actionBtn(<UserCircle size={24} strokeWidth={1.5} />, state.language === "en" ? "Profile" : "الملف", () =>
            onOpenProfile(peer.id),
          )}
          {actionBtn(<Search size={24} strokeWidth={1.5} />, state.language === "en" ? "Search" : "بحث", () => {
            setSearchQ("");
            setSubView("search");
          })}
          {actionBtn(
            isMuted ? <BellOff size={24} strokeWidth={1.5} /> : <Bell size={24} strokeWidth={1.5} />,
            state.language === "en" ? "Mute" : "كتم",
            onToggleMute,
          )}
          {actionBtn(<MoreHorizontal size={24} strokeWidth={1.5} />, state.language === "en" ? "Options" : "خيارات", () =>
            setShowOptions(true),
          )}
        </div>

        <div className="mx-4 overflow-hidden rounded-2xl border border-border bg-card">
          {menuRow(<ThemeGradientIcon />, t("groupTheme"), themeSubtitle, () => onOpenChatTheme?.())}
          {menuRow(
            <Clock size={20} strokeWidth={1.75} />,
            state.language === "en" ? "Disappearing messages" : "رسائل مختفية",
            state.language === "en" ? "Off" : "إيقاف",
            () => alert(state.language === "en" ? "Coming soon" : "قريباً"),
          )}
          {menuRow(
            <Shield size={20} strokeWidth={1.75} />,
            state.language === "en" ? "Privacy & safety" : "الخصوصية والأمان",
            undefined,
            () => alert(state.language === "en" ? "Coming soon" : "قريباً"),
          )}
          {menuRow(
            <MessageCircleWarning size={20} strokeWidth={1.75} />,
            t("groupSomethingNotWorking"),
            undefined,
            () => alert(state.language === "en" ? "Report from chat menu" : "الإبلاغ من قائمة المحادثة"),
          )}
        </div>

        <div className="mt-6 px-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[17px] font-semibold text-foreground">
              {state.language === "en" ? "Shared media" : "الوسائط المشتركة"}
            </h2>
            <span className="text-xs text-muted-foreground">{sharedMedia.length}</span>
          </div>
          {sharedMedia.length === 0 ? (
            <div className="grid grid-cols-3 gap-1.5">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="aspect-square rounded-md bg-muted/50"
                  aria-hidden
                />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-1.5">
              {sharedMedia.map(m => {
                const src = resolveMediaUrl(messageContent(m));
                return (
                  <button
                    key={m.id}
                    type="button"
                    className="relative aspect-square overflow-hidden rounded-md bg-muted"
                    onClick={() => jumpToMessage(m.id)}
                  >
                    {src ? (
                      m.type === "video" ? (
                        <video src={src} className="h-full w-full object-cover" muted playsInline />
                      ) : (
                        <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" />
                      )
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-muted-foreground">
                        <ImageIcon size={22} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {showOptions ? (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/55"
          onClick={() => setShowOptions(false)}
        >
          <div
            className="w-full max-w-md rounded-t-3xl bg-background p-3 pb-[max(1rem,var(--sab))]"
            onClick={e => e.stopPropagation()}
          >
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-[15px] text-foreground hover:bg-secondary/50"
              onClick={() => {
                setShowOptions(false);
                onToggleMute();
              }}
            >
              {isMuted ? <BellOff size={22} /> : <Bell size={22} />}
              {isMuted
                ? state.language === "en"
                  ? "Unmute notifications"
                  : "إلغاء كتم الإشعارات"
                : state.language === "en"
                  ? "Mute notifications"
                  : "كتم الإشعارات"}
            </button>
            <button
              type="button"
              className="mt-1 w-full rounded-2xl py-3 text-center text-sm font-semibold text-muted-foreground"
              onClick={() => setShowOptions(false)}
            >
              {t("cancel")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
