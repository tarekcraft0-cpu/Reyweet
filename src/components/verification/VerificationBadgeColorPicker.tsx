import { useState } from "react";
import { getApiToken, apiBackendEnabled } from "@/lib/apiBackend";
import { apiSetBadgeColor, applyVerificationPayloadToUser } from "@/lib/verificationApi";
import type { VerificationBadgeColor } from "@/lib/verificationEntitlements";
import { getUserEntitlements } from "@/lib/verificationEntitlements";
import { useApp } from "@/lib/store";
import type { User } from "@/lib/types";

const COLORS: { id: VerificationBadgeColor; label: string; hex: string }[] = [
  { id: "blue", label: "أزرق", hex: "#0095F6" },
  { id: "pink", label: "وردي", hex: "#FF2D55" },
];

export function VerificationBadgeColorPicker() {
  const { currentUser, updateProfile } = useApp();
  const [busy, setBusy] = useState(false);
  if (!currentUser || !getUserEntitlements(currentUser).isVerified) return null;

  const current = currentUser.verificationBadgeColor === "pink" ? "pink" : "blue";

  const pick = (color: VerificationBadgeColor) => {
    void (async () => {
      const token = getApiToken();
      if (!apiBackendEnabled() || !token) {
        updateProfile({ verificationBadgeColor: color }, { commitRemote: true });
        return;
      }
      setBusy(true);
      const r = await apiSetBadgeColor(token, color);
      setBusy(false);
      if (r.ok) {
        updateProfile(applyVerificationPayloadToUser(currentUser, r.data) as Partial<User>, {
          commitRemote: false,
        });
      }
    })();
  };

  return (
    <div className="mx-4 mt-4 rounded-xl border border-border bg-card p-4">
      <p className="mb-3 text-sm font-semibold text-foreground">لون علامة التوثيق</p>
      <div className="flex gap-3">
        {COLORS.map(c => (
          <button
            key={c.id}
            type="button"
            disabled={busy}
            onClick={() => pick(c.id)}
            className={
              "flex flex-1 flex-col items-center gap-2 rounded-xl border-2 py-3 transition " +
              (current === c.id ? "border-foreground" : "border-border")
            }
          >
            <span
              className="h-8 w-8 rounded-full"
              style={{ backgroundColor: c.hex }}
              aria-hidden
            />
            <span className="text-xs font-medium text-foreground">{c.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
