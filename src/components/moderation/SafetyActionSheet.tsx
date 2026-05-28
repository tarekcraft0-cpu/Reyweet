import { useState, type ReactNode } from "react";
import { Ban, Flag, VolumeX, UserX, Shield } from "lucide-react";
import type { ReportTargetType } from "@/lib/moderationTypes";
import { ReportFlowSheet } from "./ReportFlowSheet";

export function SafetyActionSheet({
  reportedUserId,
  reportedUsername,
  targetType,
  targetId,
  onClose,
  onBlock,
  onRestrict,
  onMute,
  isBlocked,
}: {
  reportedUserId: string;
  reportedUsername?: string;
  targetType: ReportTargetType;
  targetId?: string;
  onClose: () => void;
  onBlock?: () => void;
  onRestrict?: () => void;
  onMute?: () => void;
  isBlocked?: boolean;
}) {
  const [showReport, setShowReport] = useState(false);

  if (showReport) {
    return (
      <ReportFlowSheet
        open
        onClose={() => {
          setShowReport(false);
          onClose();
        }}
        reportedUserId={reportedUserId}
        reportedUsername={reportedUsername}
        targetType={targetType}
        targetId={targetId}
      />
    );
  }

  const row = (icon: ReactNode, label: string, onClick: () => void, danger?: boolean) => (
    <button
      type="button"
      onClick={onClick}
      className={
        "flex w-full items-center gap-3 px-4 py-3.5 text-start text-[15px] hover:bg-secondary " +
        (danger ? "text-destructive" : "")
      }
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary">{icon}</span>
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-[10050] flex flex-col justify-end bg-black/50" onClick={onClose}>
      <div
        className="mx-auto w-full max-w-md rounded-t-3xl bg-background animate-in slide-in-from-bottom"
        onClick={e => e.stopPropagation()}
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-muted" />
        <p className="px-4 py-3 text-center text-sm font-semibold">
          {reportedUsername ? `@${reportedUsername}` : "خيارات السلامة"}
        </p>
        {row(<Flag size={18} />, "إبلاغ", () => setShowReport(true))}
        {row(
          <UserX size={18} />,
          isBlocked ? "إلغاء الحظر" : "حظر",
          () => {
            onBlock?.();
            onClose();
          },
          true,
        )}
        {row(<Shield size={18} />, "تقييد", () => {
          onRestrict?.();
          onClose();
        })}
        {row(<VolumeX size={18} />, "كتم", () => {
          onMute?.();
          onClose();
        })}
        {row(<Ban size={18} />, "إبلاغ وحظر", () => {
          setShowReport(true);
        })}
        <div className="h-[max(12px,var(--sab))]" />
      </div>
    </div>
  );
}
