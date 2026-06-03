import { useEffect, useState } from "react";
import type { User } from "@/lib/types";
import { OnboardingOverlay, isOnboardingDone } from "./OnboardingOverlay";

/** بوابة التعريف — حالة مستقلة عن App لتجنب أخطاء المرجع في الحزمة الأصلية */
export function OnboardingGate({
  currentUser,
  isGuest,
}: {
  currentUser: User | null | undefined;
  isGuest: boolean;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!currentUser || isGuest) {
      setOpen(false);
      return;
    }
    if (!isOnboardingDone()) setOpen(true);
  }, [currentUser?.id, isGuest]);

  if (!open || !currentUser || isGuest) return null;
  return <OnboardingOverlay onDone={() => setOpen(false)} />;
}
