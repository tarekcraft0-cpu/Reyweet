import { useState } from "react";
import { X } from "lucide-react";

const KEY = "retweet_onboarding_done_v1";

export function isOnboardingDone(): boolean {
  if (typeof localStorage === "undefined") return true;
  return localStorage.getItem(KEY) === "1";
}

export function markOnboardingDone(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(KEY, "1");
}

const SLIDES = [
  {
    title: "مرحباً في ريتويت",
    body: "شارك منشورات، ستوري، وريلز — وتابع من تحب.",
  },
  {
    title: "محادثات ومكالمات",
    body: "رسائل خاصة، مجموعات، ومكالمات صوت وفيديو.",
  },
  {
    title: "إشعارات ذكية",
    body: "فعّل الإشعارات من الإعدادات لتصلك التنبيهات حتى والتطبيق مغلق.",
  },
  {
    title: "توثيق الحساب",
    body: "اشترك في التوثيق للحصول على شارة وامتيازات إضافية.",
  },
];

export function OnboardingOverlay({ onDone }: { onDone: () => void }) {
  const [idx, setIdx] = useState(0);
  const slide = SLIDES[idx]!;
  const last = idx >= SLIDES.length - 1;

  const finish = () => {
    markOnboardingDone();
    onDone();
  };

  return (
    <div
      className="fixed inset-0 z-[20000] flex items-end justify-center bg-black/55 p-4 pb-[max(1.5rem,var(--sab))]"
      role="dialog"
      aria-modal="true"
      dir="rtl"
    >
      <div className="relative w-full max-w-md rounded-[28px] border border-border bg-background px-6 py-8 text-foreground shadow-2xl">
        <button
          type="button"
          className="absolute start-4 top-4 rounded-full p-2 text-muted-foreground hover:bg-accent"
          onClick={finish}
          aria-label="تخطي"
        >
          <X size={22} />
        </button>
        <p className="text-center text-xs font-medium text-[#0095F6]">
          {idx + 1} / {SLIDES.length}
        </p>
        <h2 className="mt-4 text-center text-2xl font-bold">{slide.title}</h2>
        <p className="mt-3 text-center text-sm leading-7 text-muted-foreground">{slide.body}</p>
        <button
          type="button"
          className="mt-8 w-full rounded-2xl bg-[#0095F6] py-3.5 text-sm font-semibold text-white"
          onClick={() => (last ? finish() : setIdx(i => i + 1))}
        >
          {last ? "ابدأ" : "التالي"}
        </button>
      </div>
    </div>
  );
}
