import type { User } from "@/lib/types";

/** ملاحظة الحساب الرسمي — خارج البايو (نفس تصميم مؤسس التطبيق) */
export function FounderOfficialBanner({
  user,
}: {
  user: Pick<User, "founderVerified" | "founderOfficialLabel" | "username">;
}) {
  if (!user.founderVerified) return null;

  const handle = user.username?.trim() || "t";
  const body =
    user.founderOfficialLabel?.trim() ||
    `هذا الحساب (@${handle}) هو حساب صاحب التطبيق ومؤسسه؛ يُعرض المحتوى والتوجيه الرسمي لـ Retweet من هنا.`;

  return (
    <div
      className="mt-3 rounded-xl border border-[#D4A574] bg-gradient-to-b from-[#FFF9EB] to-[#FFF3D6] px-4 py-3.5 shadow-[0_2px_10px_rgba(180,120,40,0.12)]"
      role="note"
      aria-label="حساب رسمي — مؤسس التطبيق"
    >
      <p className="text-[15px] font-bold leading-snug text-[#B45309]">حساب رسمي — مؤسس التطبيق</p>
      <p className="mt-2 text-[13px] leading-relaxed text-[#78350F]">{body}</p>
    </div>
  );
}
