import { Check } from "lucide-react";
import {
  VERIFIED_CHAT_BUBBLE_STYLES,
  type VerifiedChatBubbleStyleId,
} from "@/lib/verifiedChatBubbleStyles";

export function ChatVerifiedBubblePickerSheet({
  open,
  selectedId,
  language,
  onSelect,
  onClose,
  busy = false,
}: {
  open: boolean;
  selectedId: VerifiedChatBubbleStyleId;
  language: string;
  onSelect: (id: VerifiedChatBubbleStyleId) => void;
  onClose: () => void;
  busy?: boolean;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[320] mx-auto flex max-w-md flex-col justify-end bg-black/50"
      role="dialog"
      aria-modal
      aria-label={language === "en" ? "Message bubbles" : "فقاعات الرسائل"}
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
          <div>
            <h2 className="text-[17px] font-semibold text-foreground">
              {language === "en" ? "Your message bubbles" : "فقاعات رسائلك"}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {language === "en"
                ? "Verified only — lightweight animations"
                : "للموثّقين — أنيميشن خفيف بدون بطء"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-3 py-1.5 text-sm font-semibold text-primary"
          >
            {language === "en" ? "Done" : "تم"}
          </button>
        </div>
        <div className="chat-theme-picker-scroll no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 pb-[max(1.25rem,var(--sab))] touch-pan-y">
          <div className="grid grid-cols-2 gap-3">
            {VERIFIED_CHAT_BUBBLE_STYLES.map(style => {
              const selected = style.id === selectedId;
              return (
                <button
                  key={style.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onSelect(style.id)}
                  className={
                    "relative flex min-h-[88px] touch-manipulation flex-col items-start justify-end rounded-2xl border-2 p-3 text-start transition active:scale-[0.97] " +
                    (selected ? "border-primary ring-2 ring-primary/25" : "border-border hover:border-primary/35") +
                    (busy ? " opacity-80" : "")
                  }
                >
                  <span
                    className={
                      "chat-message-bubble mb-2 inline-block max-w-full px-3 py-2 text-[13px] font-medium leading-snug " +
                      style.cssClass
                    }
                  >
                    {language === "en" ? "Hello!" : "مرحباً!"}
                  </span>
                  <span className="text-[13px] font-semibold text-foreground">
                    {language === "en" ? style.labelEn : style.labelAr}
                  </span>
                  {selected ? (
                    <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Check size={14} strokeWidth={2.5} />
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
