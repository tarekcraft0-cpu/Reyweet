import type { AppState } from "../../../src/lib/types.js";
import { getUserById } from "../db/engine.js";
import {
  getUserEntitlements,
  type VerificationUserFields,
} from "../../../src/lib/verificationEntitlements.js";

/**
 * يضيف حقول التوثيق لبيانات المستخدم الحالي في الـ snapshot فقط.
 * لا يحذف منشورات ولا يقلّص نصوصها ولا يؤثر على بيانات أي مستخدم آخر.
 */
export async function enforceVerificationOnAppState(
  ownerId: string,
  state: AppState,
): Promise<AppState> {
  try {
    const row = await getUserById(ownerId);
    if (!row) return state;
    const ent = getUserEntitlements(row as VerificationUserFields);

    const users = (state.users || []).map(u => {
      if (u.id !== ownerId) return u;
      return {
        ...u,
        verified: ent.isVerified,
        isSubscribed: ent.isSubscribed,
        subscriptionPlan: row.subscriptionPlan ?? u.subscriptionPlan,
        subscriptionExpiresAt: row.subscriptionExpiresAt ?? u.subscriptionExpiresAt,
        verificationStatus: row.verificationStatus ?? u.verificationStatus,
        verificationBadgeColor: ent.verificationBadgeColor,
        canUseAnimatedAvatar: ent.canUseAnimatedAvatar,
        storyMaxDuration: ent.storyMaxDurationSec,
        storyExpiryOptions: ent.storyExpiryHoursOptions,
        postCharacterLimit: ent.postCharacterLimit,
      };
    });

    return { ...state, users };
  } catch {
    return state;
  }
}
