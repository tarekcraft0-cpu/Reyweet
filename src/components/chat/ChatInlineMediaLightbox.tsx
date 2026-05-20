import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, Download, MoreVertical } from "lucide-react";
import { Avatar } from "../Avatar";
import type { User } from "@/lib/types";

type Props = {
  media: "image" | "video";
  src: string;
  sender: User | null;
  /** مثل @username */
  senderLabel: string;
  onClose: () => void;
};

/** عرض صورة/فيديو بملء الشاشة في الشات — شريط علوي أقرب لإنستغرام دايركت */
export function ChatInlineMediaLightbox({ media, src, sender, senderLabel, onClose }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const download = useCallback(() => {
    const a = document.createElement("a");
    a.href = src;
    const ext = media === "video" ? "mp4" : "jpg";
    a.download = `retweet-chat-${Date.now()}.${ext}`;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, [src, media]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("click", onDoc, true);
    return () => document.removeEventListener("click", onDoc, true);
  }, [menuOpen]);

  if (typeof document === "undefined") return null;

  const displayName = senderLabel.startsWith("@") ? senderLabel : `@${senderLabel.replace(/^@/, "")}`;

  const body = (
    <div className="fixed inset-0 z-[382] flex flex-col bg-black" role="dialog" aria-modal="true" aria-label="عرض الوسائط">
      <header
        dir="ltr"
        className="flex shrink-0 items-center gap-2 border-b border-white/10 px-2 pb-2 pt-[max(10px,env(safe-area-inset-top))]"
      >
        <button type="button" onClick={onClose} className="rounded-full p-2.5 text-white transition hover:bg-white/10" aria-label="رجوع">
          <ChevronLeft size={26} strokeWidth={2.25} />
        </button>
        <div className="flex min-w-0 flex-1 items-center justify-center gap-2 px-1">
          <Avatar name={displayName.replace(/^@/, "")} src={sender?.avatar} size={34} />
          <span className="truncate text-sm font-semibold text-white">{displayName}</span>
        </div>
        <div className="relative flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={download}
            className="rounded-full p-2.5 text-white transition hover:bg-white/10"
            aria-label="تحميل"
          >
            <Download size={22} strokeWidth={2} />
          </button>
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen(v => !v)}
              className="rounded-full p-2.5 text-white transition hover:bg-white/10"
              aria-label="خيارات"
              aria-expanded={menuOpen}
            >
              <MoreVertical size={22} strokeWidth={2} />
            </button>
            {menuOpen && (
              <div className="absolute end-0 top-full z-[2] mt-1 min-w-[11rem] overflow-hidden rounded-xl border border-white/10 bg-zinc-900/95 py-1 shadow-2xl backdrop-blur-md">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-start text-sm text-white hover:bg-white/10"
                  onClick={() => {
                    setMenuOpen(false);
                    download();
                  }}
                >
                  <Download size={18} strokeWidth={2} className="opacity-90" />
                  تحميل
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden px-1 pb-[env(safe-area-inset-bottom,0px)]">
        {media === "image" ? (
          <img src={src} alt="" className="max-h-full max-w-full object-contain" />
        ) : (
          <video src={src} controls playsInline autoPlay className="max-h-full max-w-full object-contain" preload="metadata" />
        )}
      </div>
    </div>
  );

  return createPortal(body, document.body);
}
