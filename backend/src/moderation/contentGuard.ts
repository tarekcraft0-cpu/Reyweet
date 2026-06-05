import { scanContentBundle, type ContentCheckItem } from "./contentSafety.js";
import { throwIfContentViolation } from "./contentAutoBan.js";

/** يفحص المحتوى ويحظر الحساب تلقائياً عند المخالفة */
export async function guardUserContent(
  userId: string,
  items: ContentCheckItem[],
  context: string,
): Promise<void> {
  const hit = await scanContentBundle(userId, items, context);
  await throwIfContentViolation(userId, hit);
}

export function contentViolationResponse(err: unknown): {
  status: number;
  body: Record<string, unknown>;
} | null {
  if (!err || typeof err !== "object" || (err as { name?: string }).name !== "ContentViolationError") {
    return null;
  }
  const e = err as {
    message: string;
    code: string;
    banned: boolean;
    banInfo?: unknown;
  };
  return {
    status: 403,
    body: {
      error: e.banned ? "account_banned" : e.message,
      message: e.message,
      code: e.code,
      banned: e.banned,
      banInfo: e.banInfo ?? undefined,
    },
  };
}
