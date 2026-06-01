import type { ReactNode } from "react";
import { getUserEntitlements } from "@/lib/verificationEntitlements";
import type { User } from "@/lib/types";

/** إطار ذهبي حول الصورة للمشتركين/الموثّقين */
export function VerifiedAvatarFrame({
  user,
  children,
  className = "",
  ringClassName = "p-[2.5px]",
}: {
  user: User | null | undefined;
  children: ReactNode;
  className?: string;
  ringClassName?: string;
}) {
  if (!user) return <>{children}</>;
  const ent = getUserEntitlements(user);
  if (!ent.hasVerifiedAvatarFrame) {
    return <span className={className}>{children}</span>;
  }
  return (
    <span
      className={
        "inline-flex shrink-0 rounded-full bg-gradient-to-br from-amber-400 via-[#0095F6] to-[#FF2D55] " +
        ringClassName +
        " " +
        className
      }
    >
      <span className="rounded-full bg-background p-[1px]">{children}</span>
    </span>
  );
}
