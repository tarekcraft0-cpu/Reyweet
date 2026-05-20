import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, X } from "lucide-react";
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
  calleePeerId,
}: {
  chatId: string;
  video: boolean;
  onClose: () => void;
  calleePeerId?: string;
}) {
  const { state, currentUser } = useApp();
  const me = currentUser!;
  const chat = state.chats.find(c => c.id === chatId);
  const otherId = calleePeerId || chat?.members.find(id => id !== me.id);
  const other = otherId ? userById(state, otherId) : null;
  const [muted, setMuted] = useState(false);
  const [status, setStatus] = useState("جاري الاتصال...");
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
              if (!cancelled) setStatus(s === "connected" ? "متصل" : s);
            },
          });
        } else {
          await startOutgoingCall({
            chatId,
            peerUserId: otherId,
            video,
            onRemoteStream: () => attachStreams(),
            onState: s => {
              if (!cancelled) setStatus(s === "connected" ? "متصل" : s);
            },
          });
        }
        attachStreams();
      } catch {
        if (!cancelled) setStatus("تعذّر بدء المكالمة — تحقق من الميكروفون والكاميرا");
      }
    })();
    return () => {
      cancelled = true;
      void endCall();
    };
  }, [chatId, otherId, video, calleePeerId, chat?.isGroup, chat?.isChannel]);

  const hangUp = () => {
    void endCall();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[300] bg-black text-white flex flex-col">
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
