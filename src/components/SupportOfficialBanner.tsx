import type { User } from "@/lib/types";
import { isSupportOfficialAccount } from "@/lib/supportOfficialAccount";

/** إطار حساب الدعم الرسمي */
export function SupportOfficialBanner({
  user,
}: {
  user: Pick<User, "id" | "username" | "supportOfficialVerified" | "supportOfficialLabel">;
}) {
  if (!isSupportOfficialAccount(user) && !user.supportOfficialVerified) return null;

  const body =
    user.supportOfficialLabel?.trim() ||
    "هذا هو حساب الدعم الرسمي لتطبيق Retweet — للمساعدة والبلاغات وطلبات التوثيق.";

  return (
    <div
      className="mt-3 rounded-xl border border-emerald-500/35 bg-gradient-to-b from-emerald-950/90 via-emerald-900/80 to-teal-950/90 px-4 py-3.5 shadow-[0_2px_14px_rgba(16,185,129,0.2)]"
      role="note"
      aria-label="حساب الدعم الرسمي"
    >
      <p className="text-[15px] font-bold leading-snug text-emerald-100">🛟 حساب الدعم الرسمي</p>
      <p className="mt-2 text-[13px] leading-relaxed text-emerald-100/85">{body}</p>
    </div>
  );
}
