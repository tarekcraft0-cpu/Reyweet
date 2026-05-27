import { useState } from "react";
import { BadgeCheck, Clock, XCircle } from "lucide-react";
import { getApiToken, apiBackendEnabled } from "@/lib/apiBackend";
import { apiRequestVerification, applyVerificationPayloadToUser } from "@/lib/verificationApi";
import { getUserEntitlements } from "@/lib/verificationEntitlements";
import { useApp } from "@/lib/store";
import type { User } from "@/lib/types";
import { VerifiedMarkForUser } from "../VerifiedBadge";

type Props = {
  onNeedSubscription: () => void;
};

export function VerificationRequestPanel({ onNeedSubscription }: Props) {
  const { currentUser, updateProfile } = useApp();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (!currentUser) return null;
  const ent = getUserEntitlements(currentUser);

  if (ent.isVerified) {
    return (
      <div className="mx-4 mt-4 flex items-center gap-3 rounded-xl border border-border bg-card p-4">
        <VerifiedMarkForUser user={currentUser} size={28} />
        <div>
          <p className="font-semibold text-foreground">حسابك موثّق</p>
          <p className="text-xs text-muted-foreground">تستمتع بكل مزايا التوثيق</p>
        </div>
      </div>
    );
  }

  const status = currentUser.verificationStatus ?? "none";

  const submit = () => {
    void (async () => {
      if (!ent.isSubscribed) {
        onNeedSubscription();
        return;
      }
      const token = getApiToken();
      if (!apiBackendEnabled() || !token) {
        setMsg("يلزم الاتصال بالخادم لإرسال الطلب");
        return;
      }
      setBusy(true);
      setMsg(null);
      const r = await apiRequestVerification(token);
      setBusy(false);
      if (!r.ok) {
        if (r.code === "subscription_required") {
          onNeedSubscription();
          return;
        }
        setMsg(r.error);
        return;
      }
      updateProfile(applyVerificationPayloadToUser(currentUser, r.data) as Partial<User>, {
        commitRemote: false,
      });
      setMsg("تم إرسال طلبك — سيراجعه فريق الإدارة قريباً");
    })();
  };

  return (
    <div className="mx-4 mt-4 space-y-4 rounded-xl border border-border bg-card p-4">
      <h2 className="text-[15px] font-semibold text-foreground">طلب التوثيق</h2>
      <p className="text-sm leading-relaxed text-muted-foreground">
        اشترك وادفع (بطاقة أو Apple Pay). بعد سحب المبلغ يُرسل طلبك تلقائياً لفريق الدعم للقبول أو الرفض.
      </p>

      {status === "pending" ? (
        <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
          <Clock size={18} />
          طلبك قيد المراجعة
        </div>
      ) : null}

      {status === "rejected" ? (
        <div className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <XCircle size={18} className="shrink-0 mt-0.5" />
          <span>
            تم رفض الطلب
            {currentUser.verificationRejectReason
              ? `: ${currentUser.verificationRejectReason}`
              : ""}
          </span>
        </div>
      ) : null}

      {msg ? <p className="text-sm text-[#0095F6]">{msg}</p> : null}

      {status !== "pending" ? (
        <button
          type="button"
          disabled={busy}
          onClick={submit}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0095F6] py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          <BadgeCheck size={18} />
          {busy ? "جاري الإرسال…" : "قدّم طلب"}
        </button>
      ) : null}

      {!ent.isSubscribed ? (
        <button
          type="button"
          onClick={onNeedSubscription}
          className="w-full rounded-xl border border-[#0095F6] py-2.5 text-sm font-semibold text-[#0095F6]"
        >
          اشترك أولاً ($4/شهر)
        </button>
      ) : null}
    </div>
  );
}
