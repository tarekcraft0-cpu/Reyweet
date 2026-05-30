import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { BanInfo } from "@/lib/moderationBanTypes";
import { BanScreen } from "./BanScreen";

export function BanRevealShell({
  banInfo,
  animate,
  hasPendingAppeal,
  onAppealSubmitted,
  onLogout,
}: {
  banInfo: BanInfo;
  /** انتقال من التطبيق — شاشة كاملة من اليمين لليسار (RTL) */
  animate: boolean;
  hasPendingAppeal?: boolean;
  onAppealSubmitted?: () => void;
  onLogout?: () => void;
}) {
  const [open, setOpen] = useState(!animate);

  useEffect(() => {
    if (!animate) {
      setOpen(true);
      return;
    }
    setOpen(false);
    const id = requestAnimationFrame(() => setOpen(true));
    return () => cancelAnimationFrame(id);
  }, [animate, banInfo.bannedAt]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const shell = (
    <div
      dir="rtl"
      className={
        "ban-reveal-root fixed inset-0 z-[20050] flex justify-center bg-black/50 " +
        (open ? "ban-reveal-root--open" : "")
      }
      role="alertdialog"
      aria-modal
      aria-label="تم حظر الحساب"
    >
      <div
        className={
          "ban-reveal-panel relative flex h-dvh w-full max-w-md flex-col overflow-hidden bg-background shadow-2xl will-change-transform"
        }
      >
        <BanScreen
          banInfo={banInfo}
          hasPendingAppeal={hasPendingAppeal}
          onAppealSubmitted={onAppealSubmitted}
          onLogout={onLogout}
        />
      </div>
    </div>
  );

  if (typeof document === "undefined") return shell;
  return createPortal(shell, document.body);
}
