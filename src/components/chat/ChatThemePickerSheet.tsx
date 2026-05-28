import { Check } from "lucide-react";
import {
  CHAT_WALLPAPER_THEMES,
  chatWallpaperAssetUrl,
  chatWallpaperLabel,
  type ChatWallpaperId,
} from "@/lib/chatWallpaperThemes";

export function ChatThemePickerSheet({
  open,
  selectedId,
  language,
  onSelect,
  onClose,
}: {
  open: boolean;
  selectedId: ChatWallpaperId;
  language: string;
  onSelect: (id: ChatWallpaperId) => void;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[280] mx-auto flex max-w-md flex-col justify-end bg-black/50"
      role="dialog"
      aria-modal
      aria-label={language === "en" ? "Chat theme" : "سمة المحادثة"}
      onClick={onClose}
    >
      <div
        className="max-h-[78dvh] overflow-hidden rounded-t-3xl bg-background shadow-2xl animate-in slide-in-from-bottom duration-200"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
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
        <div className="no-scrollbar overflow-y-auto px-4 py-4 pb-[max(1rem,var(--sab))]">
          <div className="grid grid-cols-2 gap-3">
            {CHAT_WALLPAPER_THEMES.map(theme => {
              const selected = theme.id === selectedId;
              const previewUrl = theme.imagePath ? chatWallpaperAssetUrl(theme.imagePath) : null;
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
                  {previewUrl ? (
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
                  ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-zinc-200 to-zinc-400 dark:from-zinc-700 dark:to-zinc-900" />
                  )}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2.5 pb-2.5 pt-8">
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
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
