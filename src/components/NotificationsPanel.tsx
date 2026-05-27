import { useApp, userById } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { Avatar } from "./Avatar";
import { Heart, MessageCircle, Repeat2, AtSign, UserPlus } from "lucide-react";
import { AppDismissSheet, RtlScreenHeader } from "./SlideDismissShell";

export function NotificationsPanel({
  onClose,
  onOpenProfile,
  onOpenChat,
}: {
  onClose: () => void;
  onOpenProfile: (id: string) => void;
  onOpenChat?: (chatId: string) => void;
}) {
  const { state, currentUser, acceptFollowRequest, declineFollowRequest } = useApp();
  const t = useT();
  const me = currentUser!;
  const list = state.notifications.filter(n => n.userId === me.id && n.type !== "message");

  return (
    <AppDismissSheet
      onClose={onClose}
      overlayZIndex={45}
      contentClassName="min-h-0 flex flex-col overflow-hidden bg-background"
    >
      <RtlScreenHeader onBack={onClose} title={t("notifications")} className="z-20 shrink-0" />
      <div className="notifications-panel-scroll no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-y-contain pb-8">
        {list.length === 0 && <p className="py-12 text-center text-muted-foreground">—</p>}
        {list.map(n => {
          const from = userById(state, n.fromId);
          const Icon =
            n.type === "like"
              ? Heart
              : n.type === "comment"
                ? MessageCircle
                : n.type === "repost"
                  ? Repeat2
                  : n.type === "mention"
                    ? AtSign
                    : n.type === "message"
                      ? MessageCircle
                      : n.type === "friend_request"
                        ? Heart
                        : UserPlus;
          const iconClass =
            n.type === "friend_request" && n.followRequestStatus !== "accepted" && n.followRequestStatus !== "declined"
              ? "shrink-0 fill-red-500 text-red-500"
              : n.type === "like"
                ? "shrink-0 fill-red-500/90 text-red-500"
                : "shrink-0 text-primary";
          const friendReqResolved =
            n.type === "friend_request" && (n.followRequestStatus === "accepted" || n.followRequestStatus === "declined");
          const friendReqPending = n.type === "friend_request" && !friendReqResolved;

          return (
            <div key={n.id} className="flex w-full flex-col gap-2 border-b border-border p-3">
              <button
                type="button"
                onClick={() => {
                  if (n.type === "message" && n.chatId) onOpenChat?.(n.chatId);
                  else if (n.type !== "friend_request" || friendReqResolved) onOpenProfile(n.fromId);
                  onClose();
                }}
                className="-m-1 flex w-full items-center gap-3 rounded-xl p-1 text-start hover:bg-secondary/60"
              >
                <Avatar name={from?.username || "?"} src={from?.avatar} />
                <Icon size={18} className={iconClass} />
                <div className="min-w-0 flex-1 text-sm">
                  <span className="font-semibold">@{from?.username}</span>{" "}
                  <span className="text-muted-foreground">
                    {n.type === "like" && (n.text || t("likes"))}
                    {n.type === "comment" && (n.text || t("comments"))}
                    {n.type === "repost" && t("reposts")}
                    {n.type === "mention" && t("notifications")}
                    {n.type === "follow" && t("follow")}
                    {n.type === "message" && "رسالة"}
                    {n.type === "friend_request" &&
                      (friendReqResolved
                        ? n.text || (n.followRequestStatus === "accepted" ? "تم قبول الطلب" : "تم رفض الطلب")
                        : me.isPrivate
                          ? "طلب متابعة — حسابك خاص"
                          : "طلب متابعة")}
                  </span>
                  {n.text && n.type !== "like" && n.type !== "comment" && n.type !== "friend_request" && (
                    <div className="mt-0.5 line-clamp-2 break-words text-xs text-muted-foreground">{n.text}</div>
                  )}
                </div>
                {!n.read && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />}
              </button>
              {friendReqPending && (
                <div className="flex gap-2 ps-12">
                  <button
                    type="button"
                    className="flex-1 rounded-xl bg-primary py-2 text-sm font-semibold text-primary-foreground"
                    onClick={() => acceptFollowRequest(n.fromId)}
                  >
                    {t("accept")}
                  </button>
                  <button
                    type="button"
                    className="flex-1 rounded-xl border border-border py-2 text-sm font-semibold"
                    onClick={() => declineFollowRequest(n.fromId)}
                  >
                    {t("decline")}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </AppDismissSheet>
  );
}
