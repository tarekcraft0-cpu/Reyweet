import type { User } from "./types";

/** حساب موثّق أو رسمي — فقاعات مميزة في المحادثة */
export function isChatVerifiedUser(user: Pick<User, "verified" | "verificationStatus" | "founderVerified" | "appOfficialVerified" | "supportOfficialVerified"> | null | undefined): boolean {
  if (!user) return false;
  return (
    user.verified === true ||
    user.verificationStatus === "approved" ||
    user.founderVerified === true ||
    user.appOfficialVerified === true ||
    user.supportOfficialVerified === true
  );
}
