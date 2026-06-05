import { applyModerationAction } from "./banEngine.js";
import { getBanInfoForUser } from "./banEngine.js";
import { getUserById } from "../db/engine.js";
import { invalidateAllUserTokens } from "../lib/tokenSecurity.js";
import { revokeAllTrustedDevices } from "../lib/loginSecurity.js";
import { SUPPORT_OFFICIAL_ACCOUNT_ID } from "../../../src/lib/supportOfficialAccount.js";

const CONTENT_MOD_EXEMPT_IDS = new Set(["u_founder_tareqf", SUPPORT_OFFICIAL_ACCOUNT_ID]);

export const SYSTEM_CONTENT_GUARD_ACTOR = "system:content-guard";

export function isContentModerationEnabled(): boolean {
  const flag = process.env.CONTENT_AUTO_BAN?.trim();
  if (flag === "0" || flag === "false") return false;
  return true;
}

export function isContentModExempt(userId: string): boolean {
  const extra = (process.env.CONTENT_MOD_EXEMPT_USER_IDS || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
  return CONTENT_MOD_EXEMPT_IDS.has(userId) || extra.includes(userId);
}

export type ContentViolationDetail = {
  code: string;
  context: string;
  snippet?: string;
};

export class ContentViolationError extends Error {
  readonly code: string;
  readonly banned: boolean;
  readonly banInfo: Awaited<ReturnType<typeof getBanInfoForUser>> | null;

  constructor(
    message: string,
    opts: { code: string; banned: boolean; banInfo?: Awaited<ReturnType<typeof getBanInfoForUser>> | null },
  ) {
    super(message);
    this.name = "ContentViolationError";
    this.code = opts.code;
    this.banned = opts.banned;
    this.banInfo = opts.banInfo ?? null;
  }
}

/** حظر عادي تلقائي (يمكن تقديم طعن) + إبطال الجلسات */
export async function autoBanForProhibitedContent(
  userId: string,
  detail: ContentViolationDetail,
): Promise<void> {
  if (!isContentModerationEnabled() || isContentModExempt(userId)) return;
  try {
    await applyModerationAction(userId, SYSTEM_CONTENT_GUARD_ACTOR, "ban", {
      reason: "نشر محتوى مخالف (إباحي أو محظور) — حظر تلقائي",
      guideline: `يمكنك تقديم طعن من الإعدادات. سياق: ${detail.context} | كود: ${detail.code}${detail.snippet ? ` | ${detail.snippet}` : ""}`,
    });
    await invalidateAllUserTokens(userId);
    await revokeAllTrustedDevices(userId);
  } catch (e) {
    console.warn("[content-guard] auto-ban failed:", userId, e);
  }
}

export async function throwIfContentViolation(
  userId: string,
  hit: ContentViolationDetail | null,
): Promise<void> {
  if (!hit) return;
  if (isContentModerationEnabled() && !isContentModExempt(userId)) {
    await autoBanForProhibitedContent(userId, hit);
    const user = await getUserById(userId);
    const banInfo = user ? await getBanInfoForUser(user) : null;
    throw new ContentViolationError("تم حظر حسابك لنشر محتوى مخالف — يمكنك تقديم طعن", {
      code: hit.code,
      banned: true,
      banInfo,
    });
  }
  throw new ContentViolationError("المحتوى مرفوض — مخالف لإرشادات المجتمع", {
    code: hit.code,
    banned: false,
  });
}
