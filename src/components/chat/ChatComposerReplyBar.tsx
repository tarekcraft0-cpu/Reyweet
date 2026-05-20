import { X } from "lucide-react";

export function ChatComposerReplyBar({
  authorLabel,
  preview,
  isQuran,
  onClose,
}: {
  authorLabel: string;
  preview: string;
  isQuran?: boolean;
  onClose: () => void;
}) {
  return (
    <div
      className={
        "flex items-stretch gap-2 border-b px-3 py-2 animate-in slide-in-from-bottom-2 duration-200 " +
        (isQuran ? "border-zinc-700 bg-zinc-900/95" : "border-border/70 bg-muted/30")
      }
    >
      <div
        className={
          "my-0.5 w-[3px] shrink-0 rounded-full " +
          (isQuran ? "bg-emerald-400" : "bg-[#0095f6]")
        }
        aria-hidden
      />
      <div className="min-w-0 flex-1 text-start">
        <p
          className={
            "text-[11px] font-semibold leading-tight " +
            (isQuran ? "text-emerald-300" : "text-[#0095f6]")
          }
        >
          {authorLabel}
        </p>
        <p
          className={
            "mt-0.5 truncate text-xs " +
            (isQuran ? "text-zinc-400" : "text-muted-foreground")
          }
        >
          {preview}
        </p>
      </div>
      <button
        type="button"
        className={
          "shrink-0 rounded-full p-1.5 " +
          (isQuran ? "text-zinc-400 hover:bg-zinc-800" : "text-muted-foreground hover:bg-secondary")
        }
        aria-label="إلغاء الرد"
        onClick={onClose}
      >
        <X size={18} />
      </button>
    </div>
  );
}
