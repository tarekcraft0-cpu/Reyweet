import { useEffect, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { CreditCard, Loader2 } from "lucide-react";
import { getApiToken } from "@/lib/apiBackend";
import { apiConfirmSubscription, apiStripePaymentIntent } from "@/lib/verificationApi";
import type { PurchaseResult } from "@/lib/subscriptionBilling";

type PayFormProps = {
  amountUsd: number;
  onPaid: (result: PurchaseResult) => void;
};

function PaymentForm({ amountUsd, onPaid }: PayFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const pay = () => {
    void (async () => {
      if (!stripe || !elements) return;
      const token = getApiToken();
      if (!token) {
        setErr("سجّل الدخول أولاً");
        return;
      }
      setBusy(true);
      setErr(null);
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}${window.location.pathname}?subscription=success`,
        },
        redirect: "if_required",
      });
      if (error) {
        setBusy(false);
        setErr(error.message || "تعذر إتمام الدفع");
        return;
      }
      const piId = paymentIntent?.id;
      if (!piId || paymentIntent.status !== "succeeded") {
        setBusy(false);
        setErr("لم يكتمل الدفع — حاول مرة أخرى");
        return;
      }
      const r = await apiConfirmSubscription(token, {
        platform: "stripe",
        paymentIntentId: piId,
      });
      setBusy(false);
      if (!r.ok) {
        setErr(r.error);
        return;
      }
      onPaid({ ok: true, data: r.data });
    })();
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
          <CreditCard size={18} className="text-[#0095F6]" />
          بطاقة بنكية أو Apple Pay
        </div>
        <PaymentElement
          options={{
            layout: "tabs",
            wallets: { applePay: "auto", googlePay: "auto" },
          }}
        />
      </div>
      {err ? <p className="text-center text-sm text-destructive">{err}</p> : null}
      <button
        type="button"
        disabled={!stripe || !elements || busy}
        onClick={pay}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#0095F6] py-3.5 text-[15px] font-semibold text-white disabled:opacity-60"
      >
        {busy ? <Loader2 size={18} className="animate-spin" /> : null}
        {busy ? "جاري الدفع…" : `ادفع $${amountUsd} وقدّم طلب التوثيق`}
      </button>
      <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
        بعد سحب المبلغ يُرسل طلبك تلقائياً لفريق الدعم للقبول أو الرفض. لا يُمنح التوثيق فوراً.
      </p>
    </div>
  );
}

type Props = {
  onPaid: (result: PurchaseResult) => void;
};

export function StripeVerificationPay({ onPaid }: Props) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [publishableKey, setPublishableKey] = useState<string | null>(null);
  const [amountUsd, setAmountUsd] = useState(4);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const token = getApiToken();
      if (!token) {
        setLoadErr("سجّل الدخول أولاً");
        setLoading(false);
        return;
      }
      const r = await apiStripePaymentIntent(token);
      setLoading(false);
      if (!r.ok) {
        setLoadErr(r.error);
        return;
      }
      setClientSecret(r.clientSecret);
      setPublishableKey(r.publishableKey);
      setAmountUsd(r.amountUsd);
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 size={20} className="animate-spin text-[#0095F6]" />
        جاري تجهيز الدفع…
      </div>
    );
  }

  if (loadErr || !clientSecret || !publishableKey) {
    return (
      <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-center text-sm text-destructive">
        {loadErr || "تعذر تحميل نموذج الدفع"}
      </p>
    );
  }

  const stripePromise = loadStripe(publishableKey);

  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret,
        appearance: {
          theme: document.documentElement.classList.contains("dark") ? "night" : "stripe",
          variables: { colorPrimary: "#0095F6", borderRadius: "12px" },
        },
        locale: "ar",
      }}
    >
      <PaymentForm amountUsd={amountUsd} onPaid={onPaid} />
    </Elements>
  );
}
