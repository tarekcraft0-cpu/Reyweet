import { useEffect, useState } from "react";
import { Ban, LogOut, MoreVertical } from "lucide-react";
import type { BanInfo } from "@/lib/moderationBanTypes";
import {
  banShowsSevereConductLine,
  resolveBanTypeLabel,
  SEVERE_BAN_CONDUCT_LINE,
} from "@/lib/banSevereConduct";
import { Avatar } from "../Avatar";
import { BottomDismissSheet } from "../BottomDismissSheet";
import { AppealFlow } from "./AppealFlow";

export function BanScreen({
  banInfo,
  hasPendingAppeal = false,
  onAppealSubmitted,
  onLogout,
}: {
  banInfo: BanInfo;
  hasPendingAppeal?: boolean;
  onAppealSubmitted?: () => void;
  onLogout?: () => void;
}) {
  const [appeal, setAppeal] = useState(false);
  const [pendingPulse, setPendingPulse] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!hasPendingAppeal) return;
    setPendingPulse(true);
    const t = window.setTimeout(() => setPendingPulse(false), 1200);
    return () => window.clearTimeout(t);
  }, [hasPendingAppeal]);

  if (appeal && banInfo.canAppeal && !hasPendingAppeal) {
    return (
      <AppealFlow
        banInfo={banInfo}
        onBack={() => setAppeal(false)}
        onSubmitted={() => {
          onAppealSubmitted?.();
          setAppeal(false);
        }}
      />
    );
  }

  const permanent = banInfo.permanentlyDisabled || banInfo.accountStatus === "PERMANENTLY_BANNED";
  const appealHoldBan = banInfo.accountStatus === "BANNED";
  const bannedDate = new Date(banInfo.bannedAt).toLocaleDateString("ar");
  const banTypeLabel = resolveBanTypeLabel(banInfo);
  const showSevereLine = banShowsSevereConductLine(banInfo);
  const detailReason =
    banInfo.banReason?.trim() &&
    banInfo.banReason.trim() !== banTypeLabel &&
    banInfo.banReason.trim() !== "انتهاك إرشادات المجتمع"
      ? banInfo.banReason.trim()
      : null;

  return (
    <div className="relative flex min-h-dvh flex-col bg-background pb-[max(1.5rem,var(--sab,0px))]">
      {onLogout ? (
        <div className="flex shrink-0 justify-start px-4 pt-[max(0.75rem,var(--sat,0px))]">
          <button
            type="button"
            aria-label="خيارات"
            aria-haspopup="dialog"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-full text-foreground hover:bg-muted/80 active:bg-muted"
          >
            <MoreVertical size={22} strokeWidth={2} />
          </button>
        </div>
      ) : null}
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-6 py-6 text-center">
        <Avatar name={banInfo.username} src={banInfo.avatar} size={88} className="mb-4" />
        <p className="text-lg font-bold">@{banInfo.username}</p>
        <div className="mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <Ban size={28} />
        </div>
        <h1 className="mt-4 text-xl font-bold">
          {permanent ? "تم تعطيل حسابك نهائياً" : "تم حظر حسابك"}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
          {permanent
            ? "Your account has been permanently disabled."
            : appealHoldBan
              ? "يبقى حسابك محظوراً حتى تقدّم طعناً للمراجعة."
              : "This account has been banned."}
        </p>
        <div className="mt-5 w-full rounded-2xl border border-destructive/35 bg-destructive/8 px-4 py-3.5 text-start shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-destructive/90">نوع الحظر</p>
          <p className="mt-1.5 text-[15px] font-bold leading-snug text-foreground">{banTypeLabel}</p>
          <p className="mt-1 text-xs text-muted-foreground">هذا هو سبب تعطيل حسابك وفق سياسات المنصة</p>
        </div>
        {showSevereLine ? (
          <div
            className="mt-3 w-full rounded-xl border-2 border-red-500 bg-red-500/20 px-4 py-3.5 text-center shadow-[0_0_20px_rgba(239,68,68,0.25)]"
            role="note"
          >
            <p className="text-[17px] font-extrabold leading-snug text-red-600 dark:text-red-400">
              {SEVERE_BAN_CONDUCT_LINE}
            </p>
          </div>
        ) : null}
        <dl className="mt-6 w-full space-y-2 rounded-2xl border border-border bg-card p-4 text-start text-sm">
          {detailReason ? (
            <div>
              <dt className="text-muted-foreground">تفاصيل إضافية</dt>
              <dd className="font-medium">{detailReason}</dd>
            </div>
          ) : null}
          <div>
            <dt className="text-muted-foreground">تاريخ الحظر</dt>
            <dd>{bannedDate}</dd>
          </div>
          {appealHoldBan && !permanent && (
            <div>
              <dt className="text-muted-foreground">مدة الحظر</dt>
              <dd>حتى تقديم طعن — لا يُرفع تلقائياً</dd>
            </div>
          )}
          {banInfo.banExpiresAt && !permanent && !appealHoldBan && (
            <div>
              <dt className="text-muted-foreground">ينتهي في</dt>
              <dd>{new Date(banInfo.banExpiresAt).toLocaleString("ar")}</dd>
            </div>
          )}
        </dl>
        {hasPendingAppeal && !permanent && (
          <div
            className={
              "mt-6 w-full rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200 " +
              (pendingPulse ? "moderation-pending-flash" : "")
            }
          >
            <p className="font-semibold text-amber-100">طلب الطعن قيد المراجعة</p>
            <p className="mt-1 text-amber-200/90">
              تم استلام طعنك. سنُبلغك هنا فور صدور القرار — لا حاجة لإعادة الإرسال.
            </p>
          </div>
        )}
        {banInfo.canAppeal && !permanent && !hasPendingAppeal && (
          <button
            type="button"
            onClick={() => setAppeal(true)}
            className="mt-6 w-full rounded-xl bg-primary py-3 font-semibold text-primary-foreground"
          >
            طعن (Appeal)
          </button>
        )}
      </div>

      {onLogout ? (
        <BottomDismissSheet
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          title="خيارات"
          zIndex={20100}
        >
          <div dir="rtl" className="px-4 pb-4 pt-2" data-no-sheet-drag>
            <button
              type="button"
              className="flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-[15px] font-semibold text-red-500 active:bg-destructive/10 dark:text-red-400"
              onClick={() => {
                setMenuOpen(false);
                onLogout();
              }}
            >
              <LogOut size={18} />
              تسجيل الخروج
            </button>
          </div>
        </BottomDismissSheet>
      ) : null}
    </div>
  );
}
