import { useEffect, useState } from "react";
import { messageContent } from "@/lib/chatNormalize";
import { emitUiToast } from "@/lib/uiToast";
import type { Message } from "@/lib/types";

export function PoolGameInviteBubble({
  message,
  meId,
  chatId,
  onJoin,
}: {
  message: Message;
  meId: string;
  chatId: string;
  onJoin: (roomId: string) => void;
}) {
  const [status, setStatus] = useState<"pending" | "joining" | "active" | "finished">("pending");
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const mc = messageContent(message);
  const parts = mc.split(":");
  const inviterId = parts[2] ?? "";
  const isInviter = meId === inviterId;
  const canJoin = !isInviter && status === "pending";

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { getApiBaseUrl, getApiToken, apiBackendEnabled } = await import("@/lib/apiBackend");
        if (!apiBackendEnabled()) return;
        const base = getApiBaseUrl().replace(/\/$/, "");
        const token = getApiToken();
        if (!token) return;
        const r = await fetch(`${base}/v1/games/pool/by-chat/${encodeURIComponent(chatId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!r.ok || cancelled) return;
        const data = (await r.json()) as { room?: { roomId: string; status: string } };
        if (data.room?.status === "active") {
          setActiveRoomId(data.room.roomId);
          setStatus("active");
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chatId]);

  const join = async () => {
    if (!canJoin) return;
    setStatus("joining");
    try {
      const { getApiBaseUrl, getApiToken } = await import("@/lib/apiBackend");
      const base = getApiBaseUrl().replace(/\/$/, "");
      const token = getApiToken();
      const r = await fetch(`${base}/v1/games/pool/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          chatId,
          opponentId: inviterId,
          inviteMessageId: message.id,
        }),
      });
      if (!r.ok) {
        setStatus("pending");
        emitUiToast("تعذّر إنشاء الغرفة");
        return;
      }
      const data = (await r.json()) as { room: { roomId: string } };
      setStatus("active");
      onJoin(data.room.roomId);
    } catch {
      setStatus("pending");
    }
  };

  return (
    <div
      className="flex flex-col items-center gap-3 rounded-2xl bg-gradient-to-br from-[#1a3a1a] to-[#0d1f0d] p-4 text-center shadow-lg"
      style={{ minWidth: 200 }}
    >
      <div className="text-4xl">🎱</div>
      <div>
        <p className="font-bold text-white text-sm">دعوة لعبة بلياردو</p>
        <p className="text-xs text-green-400 mt-0.5">
          {isInviter ? "في انتظار الخصم…" : "دعاك للعب بلياردو 8 كرات"}
        </p>
      </div>
      {!isInviter && status === "pending" && (
        <button
          type="button"
          className="rounded-xl bg-green-600 px-6 py-2 text-sm font-bold text-white shadow hover:bg-green-500 active:scale-95"
          onClick={() => void join()}
        >
          انضم للعبة
        </button>
      )}
      {status === "joining" && (
        <span className="text-xs text-green-400 animate-pulse">جاري الانضمام…</span>
      )}
      {status === "active" && activeRoomId && (
        <button
          type="button"
          className="rounded-xl bg-amber-600 px-6 py-2 text-sm font-bold text-white shadow active:scale-95"
          onClick={() => onJoin(activeRoomId)}
        >
          استئناف اللعبة
        </button>
      )}
      {status === "active" && !activeRoomId && (
        <span className="text-xs text-yellow-400">🎮 اللعبة جارية</span>
      )}
      {isInviter && status === "pending" && (
        <span className="text-xs text-gray-400">أرسلت الدعوة</span>
      )}
    </div>
  );
}
