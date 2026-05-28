import { useState } from "react";
import { Ban } from "lucide-react";
import type { BanInfo } from "@/lib/moderationBanTypes";
import { Avatar } from "../Avatar";
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
  const bannedDate = new Date(banInfo.bannedAt).toLocaleDateString("ar");

  return (
    <div className="flex min-h-dvh flex-col bg-background px-6 py-10">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center text-center">
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
            : "This account has been banned."}
        </p>
        <dl className="mt-6 w-full space-y-2 rounded-2xl border border-border bg-card p-4 text-start text-sm">
          <div>
            <dt className="text-muted-foreground">السبب</dt>
            <dd className="font-medium">{banInfo.banReason}</dd>
          </div>
          {banInfo.banGuideline && (
            <div>
              <dt className="text-muted-foreground">إرشاد المجتمع</dt>
              <dd>{banInfo.banGuideline}</dd>
            </div>
          )}
          <div>
            <dt className="text-muted-foreground">تاريخ الحظر</dt>
            <dd>{bannedDate}</dd>
          </div>
          {banInfo.banExpiresAt && !permanent && (
            <div>
              <dt className="text-muted-foreground">ينتهي في</dt>
              <dd>{new Date(banInfo.banExpiresAt).toLocaleString("ar")}</dd>
            </div>
          )}
        </dl>
        {hasPendingAppeal && !permanent && (
          <div className="mt-6 w-full rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            طلب الطعن قيد الانتظار. لا يمكنك إرسال طعن جديد حتى يتم الرد من الدعم.
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
        {onLogout && (
          <button type="button" onClick={onLogout} className="mt-3 w-full text-sm text-muted-foreground">
            تسجيل الخروج
          </button>
        )}
      </div>
    </div>
  );
}
