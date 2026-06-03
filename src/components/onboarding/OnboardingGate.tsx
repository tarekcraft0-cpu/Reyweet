import type { User } from "@/lib/types";

/**
 * التعريف معطّل مؤقتاً — كان يسبب ReferenceError في IPA القديم (showOnboarding).
 * يُعاد تفعيله بعد نشر IPA جديد من Codemagic.
 */
export function OnboardingGate(_props: {
  currentUser: User | null | undefined;
  isGuest: boolean;
}) {
  return null;
}
