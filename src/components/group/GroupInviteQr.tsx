import { useMemo } from "react";
import type { Chat } from "@/lib/types";

/** QR بسيط عبر خدمة عامة — يمكن استبداله بمكتبة محلية لاحقاً */
export function GroupInviteQr({ chat, size = 160 }: { chat: Chat; size?: number }) {
  const inviteUrl = useMemo(() => {
    if (typeof window === "undefined" || !chat.inviteCode) return "";
    return `${window.location.origin}/app/?group=${encodeURIComponent(chat.inviteCode)}`;
  }, [chat.inviteCode]);

  if (!inviteUrl) return null;

  const src = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(inviteUrl)}`;

  return (
    <img
      src={src}
      alt="رمز QR للانضمام"
      width={size}
      height={size}
      className="mx-auto rounded-xl border border-border bg-white p-2"
    />
  );
}
