import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { BanInfo } from "@/lib/moderationBanTypes";
import type { ModerationUserNotice } from "@/lib/moderationTypes";
import { BanScreen } from "./BanScreen";
import { ModerationNoticeScreen } from "./ModerationNoticeScreen";

/**
 * نفس إطار شاشة الحظر — عند فك الحظر أو التحذير تظهر الرسالة هنا فوراً
 * (بدون انتقال لصفحة منفصلة).
 */
export function ModerationGateShell({
  banInfo,
  notice,
  animateOpen = false,
  hasPendingAppeal,
  onAppealSubmitted,
  onLogout,
  onNoticeDismiss,
}: {
  banInfo: BanInfo | null;
  notice: ModerationUserNotice | null;
  animateOpen?: boolean;
  hasPendingAppeal?: boolean;
  onAppealSubmitted?: () => void;
  onLogout?: () => void;
  onNoticeDismiss: () => void;
}) {
  const [open, setOpen] = useState(!animateOpen);
  const showNotice = !!notice;

  useEffect(() => {
    if (!animateOpen) {
      setOpen(true);
      return;
    }
    setOpen(false);
    const id = requestAnimationFrame(() => setOpen(true));
    return () => cancelAnimationFrame(id);
  }, [animateOpen, banInfo?.bannedAt, notice?.id]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const ariaLabel = showNotice
    ? notice!.kind === "warning"
      ? "تحذير من الإشراف"
      : "تم استعادة الحساب"
    : "تم حظر الحساب";

  const shell = (
    <div
      dir="rtl"
      className={
        "ban-reveal-root fixed inset-0 z-[20050] flex justify-center bg-black/50 " +
        (open ? "ban-reveal-root--open" : "")
      }
      role="alertdialog"
      aria-modal
      aria-label={ariaLabel}
    >
      <div
        className={
          "ban-reveal-panel relative flex h-dvh w-full max-w-md flex-col overflow-hidden overflow-y-auto bg-background shadow-2xl will-change-transform"
        }
      >
        {showNotice ? (
          <ModerationNoticeScreen
            key={notice!.id}
            notice={notice!}
            variant="gate"
            onContinue={onNoticeDismiss}
          />
        ) : banInfo ? (
          <BanScreen
            banInfo={banInfo}
            hasPendingAppeal={hasPendingAppeal}
            onAppealSubmitted={onAppealSubmitted}
            onLogout={onLogout}
          />
        ) : null}
      </div>
    </div>
  );

  if (typeof document === "undefined") return shell;
  return createPortal(shell, document.body);
}
