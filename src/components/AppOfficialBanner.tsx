import type { User } from "@/lib/types";

/** إطار الحساب الرسمي للتطبيق — خارج البايو */
export function AppOfficialBanner({
  user,
}: {
  user: Pick<User, "appOfficialVerified" | "appOfficialLabel" | "username">;
}) {
  if (!user.appOfficialVerified) return null;

  const body =
    user.appOfficialLabel?.trim() ||
    "هذا هو الحساب الرسمي الوحيد لتطبيق Retweet — للإعلانات والتحديثات والدعم.";

  return (
    <div
      className="mt-3 rounded-xl border border-indigo-500/40 bg-gradient-to-b from-[#1e1b4b] via-[#312e81] to-[#1e1b4b] px-4 py-3.5 shadow-[0_2px_14px_rgba(99,102,241,0.25)]"
      role="note"
      aria-label="حساب التطبيق الرسمي"
    >
      <p className="text-[15px] font-bold leading-snug text-indigo-100">✦ حساب التطبيق الرسمي</p>
      <p className="mt-2 text-[13px] leading-relaxed text-indigo-200/90">{body}</p>
    </div>
  );
}
