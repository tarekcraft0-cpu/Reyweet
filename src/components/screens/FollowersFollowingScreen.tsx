import { useState } from "react";
import { useApp, userById } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { Avatar } from "../Avatar";
import { VerifiedMarkForUser } from "../VerifiedBadge";
import { userDisplayName } from "@/lib/userDisplay";
import { RtlScreenHeader, SlideDismissShell } from "../SlideDismissShell";
import type { User } from "@/lib/types";

type Tab = "followers" | "following";

export function FollowersFollowingScreen({
  userId,
  initialTab,
  onBack,
  onOpenProfile,
}: {
  userId: string;
  initialTab: Tab;
  onBack: () => void;
  onOpenProfile: (id: string) => void;
}) {
  const { state } = useApp();
  const t = useT();
  const u = userById(state, userId);
  const [tab, setTab] = useState<Tab>(initialTab);

  if (!u) return null;

  const ids = tab === "followers" ? u.followers : u.following;
  const users = ids.map(id => userById(state, id)).filter((x): x is User => !!x);

  return (
    <SlideDismissShell onDismiss={onBack} overlayZIndex={210} className="bg-background">
      <div className="flex h-full flex-col">
        <RtlScreenHeader onBack={onBack} title={`@${u.username}`} />

        <div className="flex shrink-0 border-b border-border">
          <button
            type="button"
            onClick={() => setTab("followers")}
            className={
              "flex-1 py-3 text-sm font-semibold " +
              (tab === "followers" ? "border-b-2 border-primary text-foreground" : "text-muted-foreground")
            }
          >
            {t("followers")}
          </button>
          <button
            type="button"
            onClick={() => setTab("following")}
            className={
              "flex-1 py-3 text-sm font-semibold " +
              (tab === "following" ? "border-b-2 border-primary text-foreground" : "text-muted-foreground")
            }
          >
            {t("followsCount")}
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {tab === "followers" && u.displayFollowerCount != null && u.followers.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground leading-relaxed">
              يُعرض هنا العدد الإجمالي للمتابعين فقط؛ قائمة الأسماء غير متوفرة في النسخة التجريبية.
            </p>
          ) : users.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">—</p>
          ) : (
            users.map(x => (
              <button
                key={x.id}
                type="button"
                onClick={() => onOpenProfile(x.id)}
                className="flex w-full items-center gap-3 border-b border-border/60 px-4 py-3 text-start hover:bg-secondary/50"
              >
                <Avatar name={x.username} src={x.avatar} size={44} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1 font-semibold">
                    <span className="truncate">@{x.username}</span>
                    <VerifiedMarkForUser user={x} size={14} className="shrink-0" />
                  </div>
                  <p className="truncate text-xs text-muted-foreground">{userDisplayName(x)}</p>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </SlideDismissShell>
  );
}
