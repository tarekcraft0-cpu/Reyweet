import { useState } from "react";
import { BadgeCheck, Check, ExternalLink, Sparkles } from "lucide-react";
import { SlideDismissBackButton } from "../SlideDismissShell";
import { VERIFICATION_SUBSCRIPTION_PRICE_USD } from "@/lib/verificationEntitlements";
import { purchaseVerifiedSubscription, type PurchaseResult } from "@/lib/subscriptionBilling";
import { getApiToken } from "@/lib/apiBackend";
import { applyVerificationPayloadToUser } from "@/lib/verificationApi";
import { useApp } from "@/lib/store";
import type { User } from "@/lib/types";
import { StripeVerificationPay } from "./StripeVerificationPay";

const PERKS = [
  "بعد الدفع يُرسل طلبك لفريق الدعم للقبول أو الرفض",
  "افتار متحرك (GIF)",
  "لون شارة التوثيق (أزرق / وردي)",
  "ستوري حتى 60 ثانية",
  "مدة ظهور الستوري حتى 72 ساعة",
  "منشورات حتى 1000 حرف",
];

type Props = {
  onBack: () => void;
  onSubscribed?: () => void;
};

export function VerificationSubscriptionScreen({ onBack, onSubscribed }: Props) {
  const { currentUser, updateProfile } = useApp();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handlePaid = (r: PurchaseResult) => {
    if (!r.ok) {
      setErr(r.error);
      return;
    }
    if (currentUser) {
      updateProfile(applyVerificationPayloadToUser(currentUser, r.data) as Partial<User>, {
        commitRemote: false,
      });
    }
    const queued = r.data.verificationStatus === "pending" || r.data.verificationQueued;
    setSuccessMsg(
      queued
        ? "تم الدفع بنجاح. طلب التوثيق لدى فريق الدعم — سيتم إشعارك عند القبول أو الرفض."
        : "تم تفعيل الاشتراك.",
    );
    onSubscribed?.();
  };

  const redirectCheckout = () => {
    void (async () => {
      setBusy(true);
      setErr(null);
      const r = await purchaseVerifiedSubscription();
      setBusy(false);
      if (!r.ok) {
        if (r.error === "USE_EMBEDDED_STRIPE") return;
        if (r.error.includes("جاري التحويل")) return;
        setErr(r.error);
        return;
      }
      handlePaid(r);
    })();
  };

  return (
    <div className="min-h-full bg-background pb-10" dir="rtl">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-background/95 px-3 py-3 backdrop-blur-md">
        <SlideDismissBackButton onDismiss={onBack} navScope="local" />
        <h1 className="flex-1 text-center text-[17px] font-semibold text-foreground">اشتراك التوثيق</h1>
        <span className="w-10" aria-hidden />
      </header>

      <div className="mx-4 mt-6 overflow-hidden rounded-3xl border border-border bg-gradient-to-b from-[#0095F6]/15 to-card p-6 text-center shadow-lg">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#0095F6]/20">
          <BadgeCheck className="text-[#0095F6]" size={36} strokeWidth={2.2} />
        </div>
        <p className="text-sm text-muted-foreground">اشتراك شهري — دفع حقيقي</p>
        <p className="mt-1 text-4xl font-bold tracking-tight text-foreground">
          ${VERIFICATION_SUBSCRIPTION_PRICE_USD}
          <span className="text-base font-medium text-muted-foreground">/شهر</span>
        </p>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          ادفع ببطاقة بنكية أو Apple Pay. بعد سحب المبلغ يُحوَّل طلبك تلقائياً لفريق الدعم.
        </p>
      </div>

      <ul className="mx-4 mt-6 space-y-3">
        {PERKS.map(label => (
          <li
            key={label}
            className="flex items-start gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-sm text-foreground"
          >
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#0095F6]/15">
              <Check size={14} className="text-[#0095F6]" strokeWidth={3} />
            </span>
            {label}
          </li>
        ))}
      </ul>

      {successMsg ? (
        <p className="mx-4 mt-4 rounded-xl border border-[#0095F6]/30 bg-[#0095F6]/10 px-4 py-3 text-center text-sm text-[#0095F6]">
          {successMsg}
        </p>
      ) : null}

      {err ? <p className="mx-4 mt-4 text-center text-sm text-destructive">{err}</p> : null}

      <div className="mx-4 mt-8">
        {!successMsg && getApiToken() ? (
          <StripeVerificationPay onPaid={handlePaid} />
        ) : null}

        {!successMsg ? (
          <button
            type="button"
            disabled={busy || !getApiToken()}
            onClick={redirectCheckout}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card py-3 text-sm font-medium text-foreground disabled:opacity-60"
          >
            <ExternalLink size={16} />
            {busy ? "جاري التحويل…" : "الدفع عبر صفحة Stripe (بديل)"}
          </button>
        ) : null}

        {!getApiToken() ? (
          <p className="mt-4 text-center text-sm text-muted-foreground">سجّل الدخول لتفعيل الدفع</p>
        ) : null}
      </div>
    </div>
  );
}
