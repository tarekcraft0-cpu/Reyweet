import { AlertCircle, Check, CheckCheck } from "lucide-react";
import type { MessageDeliveryStatus } from "@/lib/types";

export function ChatMessageStatus({
  status,
  mine,
  compact = false,
}: {
  status?: MessageDeliveryStatus;
  mine: boolean;
  compact?: boolean;
}) {
  if (!mine || !status) return null;
  const size = compact ? 13 : 14;
  const readClass = "text-[#53bdeb]";
  const mutedClass = mine ? "text-white/75" : "text-muted-foreground";
  if (status === "failed") {
    return (
      <AlertCircle
        size={size}
        className="text-red-400"
        strokeWidth={2.25}
        aria-label="فشل الإرسال"
        title="فشل الإرسال — تحقق من اتصالك"
      />
    );
  }
  if (status === "read") {
    return <CheckCheck size={size} className={readClass} strokeWidth={2.25} aria-label="مقروء" />;
  }
  if (status === "delivered") {
    return <CheckCheck size={size} className={mutedClass} strokeWidth={2.25} aria-label="تم التسليم" />;
  }
  return <Check size={size} className={mutedClass} strokeWidth={2.25} aria-label="مرسل" />;
}

/** أيقونة مختصرة لآخر رسالة في قائمة المحادثات */
export function ChatListOutgoingStatusIcon({ status }: { status?: MessageDeliveryStatus }) {
  if (status === "failed") {
    return <AlertCircle size={12} className="shrink-0 text-red-400" strokeWidth={2.25} aria-hidden />;
  }
  if (!status || status === "sent") {
    return <Check size={12} className="shrink-0 text-muted-foreground/70" strokeWidth={2.25} aria-hidden />;
  }
  if (status === "read") {
    return <CheckCheck size={12} className="shrink-0 text-[#53bdeb]" strokeWidth={2.25} aria-hidden />;
  }
  return <CheckCheck size={12} className="shrink-0 text-muted-foreground/70" strokeWidth={2.25} aria-hidden />;
}
