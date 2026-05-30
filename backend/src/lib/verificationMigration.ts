import { listUsers, updateUser, type UserRow } from "../db/engine.js";

/** ترحيل آمن: الموثقون سابقاً يحتفظون بكل المزايا */
export async function runVerificationMigration(): Promise<{ updated: number }> {
  const users = await listUsers();
  let updated = 0;

  for (const u of users) {
    const patch: Partial<UserRow> = {};
    const exempt =
      u.founderVerified === true ||
      u.appOfficialVerified === true ||
      u.supportOfficialVerified === true;

    if (!u.verificationStatus) {
      patch.verificationStatus = u.verified === true || exempt ? "approved" : "none";
    }

    if (u.verified === true || exempt) {
      if (u.isSubscribed !== true) patch.isSubscribed = true;
      if (!u.subscriptionPlan) patch.subscriptionPlan = exempt ? "official" : "verified_legacy";
      if (u.canUseAnimatedAvatar !== true) patch.canUseAnimatedAvatar = true;
      if ((u.storyMaxDuration ?? 0) < 60) patch.storyMaxDuration = 60;
      if (!u.storyExpiryOptions?.length) patch.storyExpiryOptions = [24, 48, 72];
      if ((u.postCharacterLimit ?? 0) < 1000) patch.postCharacterLimit = 1000;
      if (!u.verificationBadgeColor) patch.verificationBadgeColor = "blue";
      if (u.verificationStatus !== "approved") patch.verificationStatus = "approved";
    } else {
      if (u.isSubscribed == null || u.isSubscribed === undefined) patch.isSubscribed = false;
      if (!u.subscriptionPlan) patch.subscriptionPlan = "";
      if (u.canUseAnimatedAvatar == null) patch.canUseAnimatedAvatar = false;
      if (!u.storyMaxDuration) patch.storyMaxDuration = 30;
      if (!u.storyExpiryOptions?.length) patch.storyExpiryOptions = [24];
      if (!u.postCharacterLimit) patch.postCharacterLimit = 300;
      if (!u.verificationBadgeColor) patch.verificationBadgeColor = "blue";
    }

    if (Object.keys(patch).length > 0) {
      await updateUser(u.id, patch);
      updated += 1;
    }
  }

  return { updated };
}
