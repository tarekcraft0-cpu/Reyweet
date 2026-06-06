import { Check } from "lucide-react";
import {
  chatWallpaperAssetUrl,
  chatWallpaperLabel,
  chatWallpaperThemesForUser,
  isAnimatedChatWallpaper,
  type ChatWallpaperId,
} from "@/lib/chatWallpaperThemes";
import { ChatAnimatedWallpaper } from "./ChatAnimatedWallpaper";

export function ChatThemePickerSheet({
  open,
  selectedId,
  language,
  onSelect,
  onClose,
  hasExclusiveChatTheme = false,
}: {
  open: boolean;
  selectedId: ChatWallpaperId;
  language: string;
  onSelect: (id: ChatWallpaperId) => void;
  onClose: () => void;
  hasExclusiveChatTheme?: boolean;
}) {
  if (!open) return null;
  const themes = chatWallpaperThemesForUser(hasExclusiveChatTheme);
  const animated = themes.filter(isAnimatedChatWallpaper);
  const staticThemes = themes.filter(t => !isAnimatedChatWallpaper(t));

  const renderTile = (theme: (typeof themes)[number]) => {
    const selected = theme.id === selectedId;
    const previewUrl = theme.imagePath ? chatWallpaperAssetUrl(theme.imagePath) : null;
    const isVerifiedGold = theme.id === "verified_gold";
    const isAnim = isAnimatedChatWallpaper(theme);

    return (
      <button
        key={theme.id}
        type="button"
        onClick={() => onSelect(theme.id)}
        className={
          "relative aspect-[3/4] overflow-hidden rounded-2xl border-2 text-start transition " +
          (selected ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-primary/40")
        }
      >
        {isAnim && theme.animationId ? (
          <ChatAnimatedWallpaper animationId={theme.animationId} preview />
        ) : previewUrl ? (
          <>
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: `url(${previewUrl})` }}
            />
            <div
              className="absolute inset-0"
              style={{ backgroundColor: `rgba(0,0,0,${theme.overlayOpacity ?? 0.38})` }}
            />
          </>
        ) : isVerifiedGold ? (
          <div className="absolute inset-0 bg-gradient-to-br from-amber-500 via-[#0095F6] to-[#FF2D55]" />
        ) : theme.previewGradient ? (
          <div className="absolute inset-0" style={{ background: theme.previewGradient }} />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-zinc-200 to-zinc-400 dark:from-zinc-700 dark:to-zinc-900" />
        )}
        {isAnim ? (
          <span className="absolute left-2 top-2 rounded-full bg-black/45 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm">
            {language === "en" ? "LIVE" : "متحرك"}
          </span>
        ) : null}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-2.5 pb-2.5 pt-8">
          <span className="text-[13px] font-semibold text-white">
            {chatWallpaperLabel(theme, language)}
          </span>
        </div>
        {selected ? (
          <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground shadow">
            <Check size={16} strokeWidth={2.5} />
          </span>
        ) : null}
      </button>
    );
  };

  return (
    <div
      className="fixed inset-0 z-[320] mx-auto flex max-w-md flex-col justify-end bg-black/50"
      role="dialog"
      aria-modal
      aria-label={language === "en" ? "Chat theme" : "سمة المحادثة"}
      onClick={onClose}
    >
      <div
        className="chat-theme-picker-sheet pointer-events-auto flex max-h-[min(88dvh,720px)] min-h-0 w-full flex-col overflow-hidden rounded-t-3xl bg-background shadow-2xl animate-in slide-in-from-bottom duration-200"
        onClick={e => e.stopPropagation()}
        onPointerDown={e => e.stopPropagation()}
        data-no-dismiss-drag
        data-no-tab-swipe
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-[17px] font-semibold text-foreground">
            {language === "en" ? "Chat theme" : "سمة المحادثة"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-3 py-1.5 text-sm font-semibold text-primary"
          >
            {language === "en" ? "Done" : "تم"}
          </button>
        </div>
        <div className="chat-theme-picker-scroll no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 pb-[max(1.25rem,var(--sab))] touch-pan-y">
          {animated.length > 0 ? (
            <>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {language === "en" ? "Animated" : "خلفيات متحركة"}
              </p>
              <div className="mb-5 grid grid-cols-2 gap-3">{animated.map(renderTile)}</div>
            </>
          ) : null}
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {language === "en" ? "Classic" : "كلاسيكي"}
          </p>
          <div className="grid grid-cols-2 gap-3">{staticThemes.map(renderTile)}</div>
        </div>
      </div>
    </div>
  );
}
