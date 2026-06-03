import { useCallback, useEffect, useState } from "react";
import { Phone, Video } from "lucide-react";
import { useApp, userById } from "@/lib/store";
import { Avatar } from "./Avatar";
import { CallScreen } from "./screens/CallScreen";
import {
  CALL_UI_ENDED_EVENT,
  INCOMING_CALL_WINDOW_EVENT,
  START_OUTGOING_CALL_EVENT,
  type OutgoingCallDetail,
} from "@/lib/activeCallUi";
import { emitCallReject, type IncomingCallRing } from "@/lib/webrtcCall";

type ActiveCallUi =
  | { phase: "ringing"; ring: IncomingCallRing }
  | {
      phase: "active";
      chatId: string;
      video: boolean;
      calleePeerId?: string;
      minimized: boolean;
    };

export function GlobalCallOverlay() {
  const { state, currentUser } = useApp();
  const [ui, setUi] = useState<ActiveCallUi | null>(null);

  const clearUi = useCallback(() => setUi(null), []);

  useEffect(() => {
    const onRing = (e: Event) => {
      const detail = (e as CustomEvent<IncomingCallRing>).detail;
      if (!detail?.chatId || !detail?.fromUserId) return;
      setUi(prev => (prev?.phase === "active" ? prev : { phase: "ringing", ring: detail }));
    };
    const onStart = (e: Event) => {
      const detail = (e as CustomEvent<OutgoingCallDetail>).detail;
      if (!detail?.chatId || !detail?.peerUserId) return;
      setUi({
        phase: "active",
        chatId: detail.chatId,
        video: detail.video,
        minimized: false,
      });
    };
    const onEnded = () => clearUi();
    window.addEventListener(INCOMING_CALL_WINDOW_EVENT, onRing);
    window.addEventListener(START_OUTGOING_CALL_EVENT, onStart);
    window.addEventListener(CALL_UI_ENDED_EVENT, onEnded);
    return () => {
      window.removeEventListener(INCOMING_CALL_WINDOW_EVENT, onRing);
      window.removeEventListener(START_OUTGOING_CALL_EVENT, onStart);
      window.removeEventListener(CALL_UI_ENDED_EVENT, onEnded);
    };
  }, [clearUi]);

  if (!ui || !currentUser) return null;

  if (ui.phase === "ringing") {
    const caller = userById(state, ui.ring.fromUserId);
    return (
      <div className="fixed inset-x-0 top-[max(0.5rem,var(--sat))] z-[400] mx-auto max-w-md px-3 pointer-events-none">
        <div className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-xl ring-2 ring-primary/40">
          <Avatar name={caller?.username || "?"} src={caller?.avatar} size={44} />
          <div className="min-w-0 flex-1 text-start">
            <div className="text-sm font-semibold text-foreground">
              {ui.ring.video ? "مكالمة فيديو واردة" : "يتصل عليك الآن…"}
            </div>
            <div className="truncate text-xs text-muted-foreground">@{caller?.username || "?"}</div>
          </div>
          <button
            type="button"
            className="rounded-full bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
            onClick={() =>
              setUi({
                phase: "active",
                chatId: ui.ring.chatId,
                video: ui.ring.video,
                calleePeerId: ui.ring.fromUserId,
                minimized: false,
              })
            }
          >
            قبول
          </button>
          <button
            type="button"
            className="rounded-full bg-secondary px-3 py-2 text-xs font-semibold"
            onClick={() => {
              emitCallReject(ui.ring.fromUserId, ui.ring.chatId);
              clearUi();
            }}
          >
            رفض
          </button>
        </div>
      </div>
    );
  }

  const chat = state.chats.find(c => c.id === ui.chatId);
  const otherId = ui.calleePeerId || chat?.members.find(id => id !== currentUser.id);
  const other = otherId ? userById(state, otherId) : null;

  return (
    <>
      <CallScreen
        chatId={ui.chatId}
        video={ui.video}
        calleePeerId={ui.calleePeerId}
        hidden={ui.minimized}
        onMinimize={() => setUi({ ...ui, minimized: true })}
        onClose={clearUi}
      />
      {ui.minimized ? (
        <div className="fixed inset-x-0 bottom-[calc(5.25rem+var(--sab))] z-[400] mx-auto max-w-md px-3 pointer-events-none">
          <button
            type="button"
            className="pointer-events-auto flex w-full items-center gap-3 rounded-2xl border border-emerald-500/40 bg-card px-4 py-3 shadow-lg"
            onClick={() => setUi({ ...ui, minimized: false })}
          >
            <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600">
              {ui.video ? <Video size={20} /> : <Phone size={20} />}
              <span className="absolute -top-0.5 -end-0.5 h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-500" />
            </span>
            <div className="min-w-0 flex-1 text-start">
              <div className="text-sm font-semibold text-foreground">مكالمة جارية</div>
              <div className="truncate text-xs text-muted-foreground">
                @{other?.username || "?"} — اضغط للعودة
              </div>
            </div>
          </button>
        </div>
      ) : null}
    </>
  );
}
