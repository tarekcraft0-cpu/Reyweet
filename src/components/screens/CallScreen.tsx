import { useEffect, useRef, useState } from "react";
import { ChevronDown, Mic, MicOff, X } from "lucide-react";
import { useApp, userById } from "@/lib/store";
import { Avatar } from "../Avatar";
import {
  endCall,
  getActiveLocalStream,
  getActiveRemoteStream,
  prepareCalleeCall,
  setLocalAudioMuted,
  startOutgoingCall,
} from "@/lib/webrtcCall";

export function CallScreen({
  chatId,
  video,
  onClose,
  onMinimize,
  hidden,
  calleePeerId,
}: {
  chatId: string;
  video: boolean;
  onClose: () => void;
  /** تصغير الشاشة مع إبقاء WebRTC نشطاً */
  onMinimize?: () => void;
  /** إخفاء الواجهة مع إبقاء الاتصال (لا تُلغى المكالمة عند الإخفاء) */
  hidden?: boolean;
  calleePeerId?: string;
}) {
  const { state, currentUser } = useApp();
  const me = currentUser!;
  const chat = state.chats.find(c => c.id === chatId);
  const otherId = calleePeerId || chat?.members.find(id => id !== me.id);
  const other = otherId ? userById(state, otherId) : null;
  const [muted, setMuted] = useState(false);
  const [status, setStatus] = useState(calleePeerId ? "جاري الرد…" : "يرن عند الطرف الآخر…");
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!otherId || chat?.isGroup || chat?.isChannel) return;
    let cancelled = false;
    const attachStreams = () => {
      const local = getActiveLocalStream();
      const remote = getActiveRemoteStream();
      if (localVideoRef.current && local) {
        localVideoRef.current.srcObject = local;
        void localVideoRef.current.play().catch(() => {});
      }
      if (remoteVideoRef.current && remote) {
        remoteVideoRef.current.srcObject = remote;
        void remoteVideoRef.current.play().catch(() => {});
      }
    };
    void (async () => {
      try {
        if (calleePeerId) {
          await prepareCalleeCall({
            chatId,
            peerUserId: otherId,
            video,
            onRemoteStream: () => attachStreams(),
            onState: s => {
              if (!cancelled) {
                if (s === "connected") setStatus("متصل");
                else if (s === "failed") setStatus("فشل الاتصال — تحقق من الشبكة");
                else if (s === "disconnected") setStatus("انقطع الاتصال");
                else setStatus("جاري الربط…");
              }
            },
          });
        } else {
          await startOutgoingCall({
            chatId,
            peerUserId: otherId,
            video,
            onRemoteStream: () => attachStreams(),
            onState: s => {
              if (!cancelled) {
                if (s === "connected") setStatus("متصل");
                else if (s === "failed") setStatus("فشل الاتصال — قد تحتاج شبكة أقوى أو TURN");
                else if (s === "disconnected") setStatus("انقطع الاتصال");
                else setStatus("يرن… بانتظار رد الطرف الآخر");
              }
            },
          });
        }
        attachStreams();
      } catch (e) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : "";
          if (msg === "CALL_SOCKET_OFFLINE") {
            setStatus("لا يوجد اتصال فوري — الطرف الآخر قد لا يسمع الرنين");
          } else {
            setStatus("تعذّر بدء المكالمة — تحقق من الميكروفون والكاميرا والإذن");
          }
        }
      }
    })();
    const ringTimeout =
      !calleePeerId &&
      window.setTimeout(() => {
        if (cancelled) return;
        setStatus(prev =>
          prev === "متصل" ? prev : "لم يرد أحد — تأكد أن الطرف داخل التطبيق ويقبل المكالمة",
        );
      }, 55_000);
    return () => {
      cancelled = true;
      window.clearTimeout(ringTimeout);
      void endCall({ notifyPeer: true });
    };
  }, [chatId, otherId, video, calleePeerId, chat?.isGroup, chat?.isChannel]);

  const hangUp = () => {
    void endCall({ notifyPeer: true });
    onClose();
  };

  return (
    <div
      className={
        "fixed inset-0 z-[300] bg-black text-white flex flex-col " +
        (hidden ? "pointer-events-none opacity-0" : "")
      }
      aria-hidden={hidden || undefined}
    >
      {video && (
        <div className="relative flex-1 min-h-0">
          <video ref={remoteVideoRef} playsInline className="absolute inset-0 h-full w-full object-cover" />
          <video
            ref={localVideoRef}
            playsInline
            muted
            className="absolute bottom-4 end-4 h-28 w-20 rounded-xl object-cover border border-white/30"
          />
        </div>
      )}
      <div className={"flex flex-col items-center gap-3 " + (video ? "py-6" : "flex-1 justify-center")}>
        {!video && <Avatar name={other?.username || "?"} src={other?.avatar} size={120} />}
        <div className="text-xl font-semibold">@{other?.username || "?"}</div>
        <div className="text-sm text-white/60">{status}</div>
      </div>
      <div className="flex gap-4 justify-center pb-12">
        {onMinimize ? (
          <button
            type="button"
            onClick={onMinimize}
            aria-label="تصغير المكالمة"
            className="w-14 h-14 rounded-full flex items-center justify-center bg-white/20"
          >
            <ChevronDown />
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => {
            setMuted(m => {
              const next = !m;
              setLocalAudioMuted(next);
              return next;
            });
          }}
          className={"w-14 h-14 rounded-full flex items-center justify-center " + (muted ? "bg-red-600" : "bg-white/20")}
        >
          {muted ? <MicOff /> : <Mic />}
        </button>
        <button type="button" onClick={hangUp} className="w-14 h-14 rounded-full flex items-center justify-center bg-red-600">
          <X />
        </button>
      </div>
    </div>
  );
}
