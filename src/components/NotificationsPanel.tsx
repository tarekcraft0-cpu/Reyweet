import { useApp, userById } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { Avatar } from "./Avatar";
import { Heart, MessageCircle, Repeat2, AtSign, UserPlus, Flag, Shield } from "lucide-react";
import { AppDismissSheet, RtlScreenHeader } from "./SlideDismissShell";
import { SUPPORT_OFFICIAL_ACCOUNT_ID } from "@/lib/supportOfficialAccount";
import type { Notification } from "@/lib/types";
import { REPORT_CATEGORIES } from "@/lib/moderationTypes";

export function NotificationsPanel({
  onClose,
  onOpenProfile,
  onOpenChat,
  onOpenReportStatus,
}: {
  onClose: () => void;
  onOpenProfile: (id: string) => void;
  onOpenChat?: (chatId: string) => void;
  onOpenReportStatus?: (reportId: string, status?: Notification["reportStatus"]) => void;
}) {
  const { state, currentUser, acceptFollowRequest, declineFollowRequest, markNotificationRead } = useApp();
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
          const from =
            n.type === "report_update"
              ? userById(state, SUPPORT_OFFICIAL_ACCOUNT_ID) ?? userById(state, n.fromId)
              : userById(state, n.fromId);
          const Icon =
            n.type === "report_update"
              ? n.reportStatus === "approved"
                ? Shield
                : n.reportStatus === "rejected"
                  ? Flag
                  : Shield
              : n.type === "like"
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
            n.type === "report_update"
              ? n.reportStatus === "approved"
                ? "shrink-0 text-emerald-500"
                : n.reportStatus === "pending"
                  ? "shrink-0 text-primary"
                  : "shrink-0 text-muted-foreground"
              : n.type === "friend_request" && n.followRequestStatus !== "accepted" && n.followRequestStatus !== "declined"
              ? "shrink-0 fill-red-500 text-red-500"
              : n.type === "like"
                ? "shrink-0 fill-red-500/90 text-red-500"
                : "shrink-0 text-primary";
          const friendReqResolved =
            n.type === "friend_request" && (n.followRequestStatus === "accepted" || n.followRequestStatus === "declined");
          const friendReqPending = n.type === "friend_request" && !friendReqResolved;
          const reportCat =
            n.reportCategory &&
            (REPORT_CATEGORIES.find(c => c.id === n.reportCategory)?.labelAr || n.reportCategory);

          return (
            <div key={n.id} className="flex w-full flex-col gap-2 border-b border-border p-3">
              <button
                type="button"
                onClick={() => {
                  if (n.type === "report_update" && n.reportId) {
                    markNotificationRead(n.id);
                    onOpenReportStatus?.(n.reportId, n.reportStatus);
                    onClose();
                    return;
                  }
                  if (n.type === "message" && n.chatId) onOpenChat?.(n.chatId);
                  else if (n.type !== "friend_request" || friendReqResolved) onOpenProfile(n.fromId);
                  onClose();
                }}
                className="-m-1 flex w-full items-center gap-3 rounded-xl p-1 text-start hover:bg-secondary/60"
              >
                <Avatar name={from?.username || "Retweet"} src={from?.avatar} />
                <Icon size={18} className={iconClass} />
                <div className="min-w-0 flex-1 text-sm">
                  {n.type === "report_update" ? (
                    <>
                      <span className="font-semibold">بلاغك — دعم Retweet</span>{" "}
                      <span className="text-muted-foreground block mt-0.5 leading-snug">
                        {n.text ||
                          (n.reportStatus === "pending"
                            ? "بلاغك قيد المراجعة"
                            : n.reportStatus === "approved"
                              ? "تمت إزالة الحساب"
                              : "لم تتم إزالة الحساب")}
                      </span>
                      {reportCat && (
                        <span className="mt-1 inline-block rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">
                          {reportCat}
                        </span>
                      )}
                    </>
                  ) : (
                    <>
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
                    </>
                  )}
                  {n.text && n.type !== "like" && n.type !== "comment" && n.type !== "friend_request" && n.type !== "report_update" && (
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
