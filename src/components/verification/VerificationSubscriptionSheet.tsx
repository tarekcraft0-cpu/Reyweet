import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { BadgeCheck, Check, ChevronLeft, ChevronRight, Loader2, X } from "lucide-react";
import {
  DEFAULT_VERIFICATION_TIER_ID,
  VERIFICATION_TIERS,
  type VerificationTier,
  type VerificationTierId,
} from "@/lib/verificationTiers";
import { getApiToken } from "@/lib/apiBackend";
import { applyVerificationPayloadToUser } from "@/lib/verificationApi";
import { purchaseVerifiedSubscription, type PurchaseResult } from "@/lib/subscriptionBilling";
import { useApp } from "@/lib/store";
import type { User } from "@/lib/types";
import { StripeVerificationPay } from "./StripeVerificationPay";

type Props = {
  open: boolean;
  onClose: () => void;
  onSubscribed?: () => void;
};

function TierCard({
  tier,
  active,
  neighbor,
}: {
  tier: VerificationTier;
  active: boolean;
  neighbor: boolean;
}) {
  return (
    <article
      className={`flex h-full min-h-[clamp(400px,54vh,540px)] w-full flex-col rounded-[28px] border p-6 transition-[transform,opacity,box-shadow,border-color] duration-300 ease-out ${
        active
          ? "scale-100 border-[#0095F6] bg-gradient-to-b from-[#0095F6]/14 to-card opacity-100 shadow-xl ring-1 ring-[#0095F6]/35"
          : neighbor
            ? "scale-[0.94] border-border/80 bg-card/90 opacity-80 shadow-md"
            : "scale-[0.9] border-border/60 bg-card/70 opacity-55 shadow-sm"
      }`}
    >
      {tier.badgeAr ? (
        <span className="mb-4 w-fit rounded-full bg-[#0095F6]/15 px-3.5 py-1.5 text-[13px] font-semibold text-[#0095F6]">
          {tier.badgeAr}
        </span>
      ) : null}
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#0095F6]/15">
          <BadgeCheck className="text-[#0095F6]" size={30} strokeWidth={2.2} />
        </div>
        <h3 className="text-[26px] font-bold leading-tight text-foreground">{tier.nameAr}</h3>
      </div>
      <p className="mt-4 text-[40px] font-bold tracking-tight text-foreground">
        ${tier.priceUsd}
        <span className="text-lg font-medium text-muted-foreground">/شهر</span>
      </p>
      <ul className="mt-6 flex-1 space-y-3 overflow-y-auto overscroll-contain pr-0.5">
        {tier.perksAr.map(label => (
          <li key={label} className="flex items-start gap-3 text-[15px] leading-relaxed text-foreground">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#0095F6]/15">
              <Check size={14} className="text-[#0095F6]" strokeWidth={3} />
            </span>
            {label}
          </li>
        ))}
      </ul>
    </article>
  );
}

const CAROUSEL_GAP_PX = 14;
const CAROUSEL_SLIDE_RATIO = 0.88;

/** تمرير أفقي بـ scroll-snap — أوثق من سحب pointer على iOS */
function TierSwipeCarousel({
  index,
  onIndexChange,
  disabled,
  children,
}: {
  index: number;
  onIndexChange: (i: number) => void;
  disabled?: boolean;
  children: ReactNode[];
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const syncingRef = useRef(false);
  const scrollEndRef = useRef(0);
  const maxIndex = Math.max(0, children.length - 1);
  const clampedIndex = Math.min(maxIndex, Math.max(0, index));

  const scrollToIndex = useCallback(
    (i: number, behavior: ScrollBehavior = "smooth") => {
      const scroller = scrollerRef.current;
      if (!scroller) return;
      const slide = scroller.children[i] as HTMLElement | undefined;
      if (!slide) return;
      syncingRef.current = true;
      const targetLeft = slide.offsetLeft - (scroller.clientWidth - slide.offsetWidth) / 2;
      scroller.scrollTo({ left: Math.max(0, targetLeft), behavior });
      window.setTimeout(() => {
        syncingRef.current = false;
      }, behavior === "instant" ? 0 : 380);
    },
    [],
  );

  useLayoutEffect(() => {
    scrollToIndex(clampedIndex, "instant");
  }, [clampedIndex, scrollToIndex]);

  const resolveIndexFromScroll = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller || syncingRef.current) return clampedIndex;
    const center = scroller.scrollLeft + scroller.clientWidth / 2;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < scroller.children.length; i++) {
      const el = scroller.children[i] as HTMLElement;
      const elCenter = el.offsetLeft + el.offsetWidth / 2;
      const d = Math.abs(elCenter - center);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    return best;
  }, [clampedIndex]);

  const onScroll = () => {
    if (disabled || syncingRef.current) return;
    window.clearTimeout(scrollEndRef.current);
    scrollEndRef.current = window.setTimeout(() => {
      const best = resolveIndexFromScroll();
      if (best !== clampedIndex) onIndexChange(best);
    }, 60);
  };

  return (
    <div className="relative w-full min-h-[clamp(400px,54vh,540px)]">
      <div
        ref={scrollerRef}
        dir="ltr"
        role="region"
        aria-roledescription="carousel"
        aria-label="باقات الاشتراك — اسحب يميناً أو يساراً للتبديل"
        className={
          "no-scrollbar flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain py-1 " +
          (disabled ? "pointer-events-none opacity-60" : "")
        }
        style={{
          gap: CAROUSEL_GAP_PX,
          scrollPaddingInline: "6%",
          WebkitOverflowScrolling: "touch",
          touchAction: "pan-x",
        }}
        onScroll={onScroll}
      >
        {children.map((child, i) => (
          <div
            key={i}
            className="shrink-0 snap-center"
            style={{ width: `${CAROUSEL_SLIDE_RATIO * 100}%` }}
          >
            {child}
          </div>
        ))}
      </div>
    </div>
  );
}

export function VerificationSubscriptionSheet({ open, onClose, onSubscribed }: Props) {
  const { currentUser, updateProfile } = useApp();
  const [tierIndex, setTierIndex] = useState(1);
  const [showPay, setShowPay] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [dragY, setDragY] = useState(0);
  const [sheetDragging, setSheetDragging] = useState(false);
  const sheetDragRef = useRef({ pointerId: -1, startY: 0, dragging: false });

  const tier = VERIFICATION_TIERS[tierIndex] ?? VERIFICATION_TIERS[1];
  const tierId: VerificationTierId = tier.id;

  const resetSheet = useCallback(() => {
    setShowPay(false);
    setErr(null);
    setSuccessMsg(null);
    setDragY(0);
    setSheetDragging(false);
  }, []);

  useEffect(() => {
    if (!open) {
      resetSheet();
      return;
    }
    const idx = VERIFICATION_TIERS.findIndex(t => t.id === DEFAULT_VERIFICATION_TIER_ID);
    setTierIndex(idx >= 0 ? idx : 1);
    setShowPay(false);
    setErr(null);
    setSuccessMsg(null);
  }, [open, resetSheet]);

  const goTier = (next: number) => {
    setTierIndex(Math.min(VERIFICATION_TIERS.length - 1, Math.max(0, next)));
  };

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
        ? "تم الدفع. طلب التوثيق لدى فريق الدعم — سنُخبرك عند القبول أو الرفض."
        : "تم تفعيل الاشتراك.",
    );
    onSubscribed?.();
  };

  const redirectCheckout = () => {
    void (async () => {
      setBusy(true);
      setErr(null);
      const r = await purchaseVerifiedSubscription(tierId);
      setBusy(false);
      if (!r.ok) {
        if (r.error === "USE_EMBEDDED_STRIPE") {
          setShowPay(true);
          return;
        }
        if (r.error.includes("جاري التحويل")) return;
        setErr(r.error);
        return;
      }
      handlePaid(r);
    })();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[10150] bg-black/55" role="dialog" aria-modal="true" aria-label="باقات التوثيق">
      <div
        className="absolute inset-x-0 bottom-0 top-[max(0.35rem,var(--sat))] mx-auto flex w-full max-w-lg flex-col overflow-hidden rounded-t-[32px] border border-border bg-background text-foreground shadow-2xl"
        style={{
          transform: `translate3d(0, ${Math.max(0, dragY)}px, 0)`,
          transition: sheetDragging ? "none" : "transform 240ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
        onPointerDown={e => {
          if (e.pointerType === "mouse" && e.button !== 0) return;
          const target = e.target as HTMLElement | null;
          if (!target?.closest("[data-subscription-drag-handle]")) return;
          sheetDragRef.current = {
            pointerId: e.pointerId,
            startY: e.clientY - dragY,
            dragging: true,
          };
          setSheetDragging(true);
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            /* ignore */
          }
        }}
        onPointerMove={e => {
          const d = sheetDragRef.current;
          if (!d.dragging || d.pointerId !== e.pointerId) return;
          setDragY(Math.max(0, e.clientY - d.startY));
        }}
        onPointerUp={e => {
          const d = sheetDragRef.current;
          if (!d.dragging || d.pointerId !== e.pointerId) return;
          d.dragging = false;
          setSheetDragging(false);
          if (dragY > 150) onClose();
          else setDragY(0);
          try {
            e.currentTarget.releasePointerCapture(e.pointerId);
          } catch {
            /* ignore */
          }
        }}
        onPointerCancel={e => {
          const d = sheetDragRef.current;
          if (d.pointerId !== e.pointerId) return;
          d.dragging = false;
          setSheetDragging(false);
          setDragY(0);
        }}
      >
        <div data-subscription-drag-handle className="shrink-0 px-5 pb-3 pt-5">
          <div className="mx-auto mb-4 h-1.5 w-16 rounded-full bg-muted-foreground/35" />
          <div className="relative text-center">
            <button
              type="button"
              className="absolute start-0 top-0 rounded-full p-2.5 text-foreground hover:bg-accent"
              onClick={onClose}
              aria-label="إغلاق"
            >
              <X size={24} />
            </button>
            <h3 className="text-[26px] font-bold text-foreground">اشتراك التوثيق</h3>
            <p className="mx-auto mt-2.5 max-w-[94%] text-[15px] leading-7 text-muted-foreground">
              اسحب لليمين للباقة التالية · لليسار للباقة السابقة
            </p>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-5">
          <div className="relative px-1">
            <button
              type="button"
              aria-label="الباقة السابقة"
              disabled={tierIndex <= 0 || showPay}
              onClick={() => goTier(tierIndex - 1)}
              className="absolute start-1 top-[48%] z-20 -translate-y-1/2 rounded-full border border-border bg-background/95 p-2.5 shadow-lg backdrop-blur-sm transition-opacity disabled:opacity-25"
            >
              <ChevronRight size={22} />
            </button>
            <button
              type="button"
              aria-label="الباقة التالية"
              disabled={tierIndex >= VERIFICATION_TIERS.length - 1 || showPay}
              onClick={() => goTier(tierIndex + 1)}
              className="absolute end-1 top-[48%] z-20 -translate-y-1/2 rounded-full border border-border bg-background/95 p-2.5 shadow-lg backdrop-blur-sm transition-opacity disabled:opacity-25"
            >
              <ChevronLeft size={22} />
            </button>

            <TierSwipeCarousel
              key={open ? "subscription-carousel-open" : "subscription-carousel-closed"}
              index={tierIndex}
              onIndexChange={goTier}
              disabled={showPay}
            >
              {VERIFICATION_TIERS.map((t, i) => (
                <TierCard
                  key={t.id}
                  tier={t}
                  active={i === tierIndex}
                  neighbor={Math.abs(i - tierIndex) === 1}
                />
              ))}
            </TierSwipeCarousel>

            <div className="mt-5 flex justify-center gap-2.5">
              {VERIFICATION_TIERS.map((t, i) => (
                <button
                  key={t.id}
                  type="button"
                  aria-label={t.nameAr}
                  onClick={() => goTier(i)}
                  className={`rounded-full transition-all duration-300 ${
                    i === tierIndex
                      ? "h-2.5 w-8 bg-[#0095F6]"
                      : "h-2.5 w-2.5 bg-muted-foreground/35 hover:bg-muted-foreground/55"
                  }`}
                />
              ))}
            </div>
          </div>

          {successMsg ? (
            <p className="mx-5 mt-5 rounded-2xl border border-[#0095F6]/30 bg-[#0095F6]/10 px-4 py-3.5 text-center text-[15px] text-[#0095F6]">
              {successMsg}
            </p>
          ) : null}

          {err ? <p className="mx-5 mt-4 text-center text-[15px] text-destructive">{err}</p> : null}

          {!successMsg && showPay && getApiToken() ? (
            <div className="mx-5 mt-5">
              <StripeVerificationPay tierId={tierId} onPaid={handlePaid} />
              <button
                type="button"
                className="mt-4 w-full text-center text-sm text-muted-foreground underline"
                onClick={() => setShowPay(false)}
              >
                رجوع لاختيار الباقة
              </button>
            </div>
          ) : null}

          {!successMsg && !showPay ? (
            <div className="mx-5 mt-6 space-y-2.5 pb-1">
              <button
                type="button"
                disabled={busy || !getApiToken()}
                onClick={() => {
                  setErr(null);
                  redirectCheckout();
                }}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#0095F6] py-4 text-[17px] font-semibold text-white shadow-lg shadow-[#0095F6]/25 disabled:opacity-60"
              >
                {busy ? <Loader2 size={20} className="animate-spin" /> : null}
                {busy ? "جاري التحضير…" : `اشترك — $${tier.priceUsd}/شهر`}
              </button>
              <p className="text-center text-xs leading-relaxed text-muted-foreground">
                دفع آمن ببطاقة أو Apple Pay. التوثيق بعد موافقة الفريق وليس فوراً.
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
