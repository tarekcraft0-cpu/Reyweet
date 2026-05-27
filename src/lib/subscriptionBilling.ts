import { Capacitor } from "@capacitor/core";
import { apiBackendEnabled, getApiToken } from "./apiBackend";
import {
  apiConfirmSubscription,
  apiStripeCheckout,
  apiStripePaymentIntent,
  type VerificationStatusResponse,
} from "./verificationApi";

export type PurchaseResult =
  | { ok: true; data: VerificationStatusResponse }
  | { ok: false; error: string };

/** تأكيد الدفع وتفعيل الاشتراك + طلب التوثيق للدعم */
export async function finalizePaidSubscription(
  token: string,
  body: {
    platform: "stripe" | "apple" | "google" | "dev";
    paymentIntentId?: string;
    transactionId?: string;
    receipt?: string;
  },
): Promise<PurchaseResult> {
  const r = await apiConfirmSubscription(token, body);
  if (r.ok) return { ok: true, data: r.data };
  return { ok: false, error: r.error };
}

/** بدء اشتراك التوثيق — دفع حقيقي (Stripe على الويب، متجر على الجوال) */
export async function purchaseVerifiedSubscription(): Promise<PurchaseResult> {
  const token = getApiToken();
  if (!apiBackendEnabled() || !token) {
    return { ok: false, error: "الخادم غير متصل" };
  }

  const platform = Capacitor.getPlatform();

  if (platform === "ios") {
    return purchaseViaStore(token, "apple");
  }
  if (platform === "android") {
    return purchaseViaStore(token, "google");
  }

  const intent = await apiStripePaymentIntent(token);
  if (intent.ok) {
    return { ok: false, error: "USE_EMBEDDED_STRIPE" };
  }

  const checkout = await apiStripeCheckout(token);
  if (checkout.ok) {
    window.location.href = checkout.url;
    return { ok: false, error: "جاري التحويل لصفحة الدفع الآمنة…" };
  }

  if (import.meta.env.DEV && import.meta.env.VITE_ALLOW_DEV_SUBSCRIPTION === "1") {
    const dev = await apiConfirmSubscription(token, { platform: "dev", transactionId: "dev-local" });
    if (dev.ok) return { ok: true, data: dev.data };
  }

  return {
    ok: false,
    error:
      checkout.error ||
      intent.error ||
      "إعداد الدفع غير مكتمل. أضف STRIPE_SECRET_KEY و STRIPE_PUBLISHABLE_KEY في backend/.env",
  };
}

async function purchaseViaStore(
  token: string,
  platform: "apple" | "google",
): Promise<PurchaseResult> {
  const w = window as Window & {
    CdvPurchase?: { store?: { order?: (id: string) => Promise<{ transactionId?: string }> } };
  };

  if (w.CdvPurchase?.store?.order) {
    try {
      const order = await w.CdvPurchase.store.order("verified_monthly");
      const tx = order?.transactionId || `native-${Date.now()}`;
      return finalizePaidSubscription(token, { platform, transactionId: tx, receipt: tx });
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "فشل الشراء من المتجر" };
    }
  }

  return {
    ok: false,
    error:
      platform === "ios"
        ? "استخدم الدفع عبر الويب (بطاقة / Apple Pay) أو اربط Apple In-App Purchase ثم أعد بناء التطبيق."
        : "استخدم الدفع عبر الويب (بطاقة) أو اربط Google Play Billing ثم أعد بناء التطبيق.",
  };
}

/** بعد العودة من Stripe (Checkout أو Payment Element) */
export async function confirmStripeReturn(opts: {
  sessionId?: string | null;
  paymentIntentId?: string | null;
}): Promise<PurchaseResult> {
  const token = getApiToken();
  if (!token) return { ok: false, error: "غير مسجّل" };
  const pi = opts.paymentIntentId?.trim();
  const sess = opts.sessionId?.trim();
  if (pi) {
    return finalizePaidSubscription(token, { platform: "stripe", paymentIntentId: pi });
  }
  if (sess) {
    return finalizePaidSubscription(token, { platform: "stripe", transactionId: sess });
  }
  return { ok: false, error: "لم يُعثر على معرّف الدفع" };
}
