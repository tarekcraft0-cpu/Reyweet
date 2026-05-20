import { useApp, userById } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { Avatar } from "./Avatar";
import { Heart, MessageCircle, Repeat2, AtSign, X, UserPlus } from "lucide-react";

export function NotificationsPanel({ onClose, onOpenProfile, onOpenChat }: { onClose: () => void; onOpenProfile: (id: string) => void; onOpenChat?: (chatId: string) => void }) {
  const { state, currentUser, markNotificationsRead, acceptFollowRequest, declineFollowRequest } = useApp();
  const t = useT();
  const me = currentUser!;
  const list = state.notifications.filter(n => n.userId === me.id && n.type !== "message");

  return (
    <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose}>
      <div className="absolute inset-0 max-w-md mx-auto bg-background overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-background border-b border-border flex items-center justify-between p-3">
          <h2 className="font-bold">{t("notifications")}</h2>
          <button onClick={() => { markNotificationsRead(); onClose(); }}><X /></button>
        </div>
        {list.length === 0 && <p className="text-center text-muted-foreground py-12">—</p>}
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
          const friendReqResolved = n.type === "friend_request" && (n.followRequestStatus === "accepted" || n.followRequestStatus === "declined");
          const friendReqPending = n.type === "friend_request" && !friendReqResolved;

          return (
            <div key={n.id} className="w-full flex flex-col gap-2 p-3 border-b border-border">
              <button
                type="button"
                onClick={() => {
                  if (n.type === "message" && n.chatId) onOpenChat?.(n.chatId);
                  else if (n.type !== "friend_request" || friendReqResolved) onOpenProfile(n.fromId);
                  onClose();
                }}
                className="w-full flex items-center gap-3 hover:bg-secondary/60 rounded-xl p-1 -m-1 text-start"
              >
                <Avatar name={from?.username || "?"} src={from?.avatar} />
                <Icon size={18} className={iconClass} />
                <div className="flex-1 text-sm min-w-0">
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
                    <div className="text-xs text-muted-foreground line-clamp-2 break-words mt-0.5">{n.text}</div>
                  )}
                </div>
                {!n.read && <span className="w-2 h-2 bg-primary rounded-full shrink-0" />}
              </button>
              {friendReqPending && (
                <div className="flex gap-2 ps-12" onClick={e => e.stopPropagation()}>
                  <button
                    type="button"
                    className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold"
                    onClick={() => acceptFollowRequest(n.fromId)}
                  >
                    قبول
                  </button>
                  <button
                    type="button"
                    className="flex-1 py-2 rounded-xl bg-secondary text-sm font-semibold"
                    onClick={() => declineFollowRequest(n.fromId)}
                  >
                    رفض
                  </button>
                </div>
              )}
              {friendReqResolved && n.type === "friend_request" && (
                <p className="ps-12 text-xs text-muted-foreground">
                  {n.followRequestStatus === "accepted" ? "✓ تم القبول" : "تم الرفض"}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
