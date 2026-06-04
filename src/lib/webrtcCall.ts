import type { Socket } from "socket.io-client";
import { buildIceServers } from "./iceServers";

export type CallSignalPayload = {
  fromUserId: string;
  chatId: string;
  signal: RTCSessionDescriptionInit | RTCIceCandidateInit;
};

export type IncomingCallRing = {
  fromUserId: string;
  chatId: string;
  video: boolean;
};

type ActiveCall = {
  chatId: string;
  peerUserId: string;
  video: boolean;
  role: "caller" | "callee";
  pc: RTCPeerConnection;
  localStream: MediaStream;
  remoteStream: MediaStream | null;
  offerSent: boolean;
  onRemoteStream?: (stream: MediaStream) => void;
  onState?: (state: string) => void;
};

let active: ActiveCall | null = null;
let socketRef: Socket | null = null;
const pendingSignals = new Map<string, CallSignalPayload[]>();

function signalKey(chatId: string, fromUserId: string): string {
  return `${chatId}:${fromUserId}`;
}

function bufferSignal(payload: CallSignalPayload): void {
  const key = signalKey(payload.chatId, payload.fromUserId);
  const list = pendingSignals.get(key) ?? [];
  list.push(payload);
  pendingSignals.set(key, list);
}

async function flushBufferedSignals(chatId: string, peerUserId: string): Promise<void> {
  const key = signalKey(chatId, peerUserId);
  const list = pendingSignals.get(key) ?? [];
  pendingSignals.delete(key);
  for (const payload of list) {
    await handleRemoteCallSignal(payload);
  }
}

export function getActiveCallMeta(): {
  chatId: string;
  peerUserId: string;
  video: boolean;
  role: "caller" | "callee";
} | null {
  if (!active) return null;
  return {
    chatId: active.chatId,
    peerUserId: active.peerUserId,
    video: active.video,
    role: active.role,
  };
}

function setupPeerConnection(opts: {
  chatId: string;
  peerUserId: string;
  video: boolean;
  role: "caller" | "callee";
  localStream: MediaStream;
  onRemoteStream?: (stream: MediaStream) => void;
  onState?: (state: string) => void;
}): ActiveCall {
  const pc = new RTCPeerConnection({ iceServers: buildIceServers() });
  for (const track of opts.localStream.getTracks()) {
    pc.addTrack(track, opts.localStream);
  }
  const remoteStream = new MediaStream();
  const call: ActiveCall = {
    chatId: opts.chatId,
    peerUserId: opts.peerUserId,
    video: opts.video,
    role: opts.role,
    pc,
    localStream: opts.localStream,
    remoteStream,
    offerSent: false,
    onRemoteStream: opts.onRemoteStream,
    onState: opts.onState,
  };
  pc.ontrack = ev => {
    if (ev.streams[0]) {
      for (const t of ev.streams[0].getTracks()) remoteStream.addTrack(t);
    } else if (ev.track) {
      remoteStream.addTrack(ev.track);
    }
    call.onRemoteStream?.(remoteStream);
  };
  pc.onicecandidate = ev => {
    if (ev.candidate && active?.chatId === opts.chatId) {
      emitSignal(opts.peerUserId, opts.chatId, ev.candidate);
    }
  };
  pc.onconnectionstatechange = () => {
    call.onState?.(pc.connectionState);
  };
  return call;
}

async function sendOutgoingOffer(): Promise<void> {
  if (!active || active.role !== "caller" || active.offerSent) return;
  active.offerSent = true;
  const offer = await active.pc.createOffer();
  await active.pc.setLocalDescription(offer);
  emitSignal(active.peerUserId, active.chatId, offer);
}

export function bindCallSocket(socket: Socket | null): void {
  if (socketRef) {
    socketRef.off("call:ended");
    socketRef.off("call:reject");
    socketRef.off("call:accept");
  }
  socketRef = socket;
  if (!socket) return;
  const onRemoteHangup = () => {
    void endCall({ notifyPeer: false });
    import("./activeCallUi.js").then(m => m.dispatchCallUiEnded());
  };
  socket.on("call:ended", onRemoteHangup);
  socket.on("call:reject", onRemoteHangup);
  socket.on("call:accept", (raw: unknown) => {
    const p = raw as { fromUserId?: string; chatId?: string };
    if (!p?.fromUserId || !p?.chatId) return;
    void handleRemoteCallAccept({ fromUserId: p.fromUserId, chatId: p.chatId });
  });
}

async function ensureCallSocketConnected(): Promise<void> {
  if (socketRef?.connected) return;
  const { waitForRealtimeSocket } = await import("./realtimeSocket.js");
  const ok = await waitForRealtimeSocket(5000);
  if (!ok || !socketRef?.connected) {
    throw new Error("CALL_SOCKET_OFFLINE");
  }
}

export function emitCallReject(toUserId: string, chatId: string): void {
  if (!socketRef?.connected) return;
  socketRef.emit("call:reject", { toUserId, chatId });
}

export function emitCallAccept(toUserId: string, chatId: string): void {
  if (!socketRef?.connected) return;
  socketRef.emit("call:accept", { toUserId, chatId });
}

export function emitCallRing(toUserId: string, chatId: string, video: boolean): boolean {
  if (!socketRef?.connected) return false;
  socketRef.emit("call:ring", { toUserId, chatId, video });
  return true;
}

function emitSignal(toUserId: string, chatId: string, signal: unknown): void {
  if (!socketRef?.connected) return;
  socketRef.emit("call:signal", { toUserId, chatId, signal });
}

export async function handleRemoteCallAccept(payload: {
  fromUserId: string;
  chatId: string;
}): Promise<void> {
  if (!active || active.chatId !== payload.chatId || active.peerUserId !== payload.fromUserId) {
    return;
  }
  if (active.role !== "caller") return;
  await sendOutgoingOffer();
}

export async function handleRemoteCallSignal(payload: CallSignalPayload): Promise<void> {
  if (!active || active.chatId !== payload.chatId || active.peerUserId !== payload.fromUserId) {
    bufferSignal(payload);
    return;
  }
  const { pc } = active;
  const sig = payload.signal;
  if ("type" in sig && (sig.type === "offer" || sig.type === "answer")) {
    await pc.setRemoteDescription(new RTCSessionDescription(sig));
    if (sig.type === "offer") {
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      emitSignal(active.peerUserId, active.chatId, answer);
    }
    return;
  }
  if ("candidate" in sig && sig.candidate) {
    try {
      await pc.addIceCandidate(new RTCIceCandidate(sig));
    } catch {
      /* ignore late candidates */
    }
  }
}

export async function prepareCalleeCall(opts: {
  chatId: string;
  peerUserId: string;
  video: boolean;
  onRemoteStream?: (stream: MediaStream) => void;
  onState?: (state: string) => void;
}): Promise<void> {
  await endCall({ notifyPeer: false });
  const localStream = await navigator.mediaDevices.getUserMedia({
    audio: true,
    video: opts.video,
  });
  active = setupPeerConnection({ ...opts, role: "callee", localStream });
  emitCallAccept(opts.peerUserId, opts.chatId);
  await flushBufferedSignals(opts.chatId, opts.peerUserId);
}

export async function startOutgoingCall(opts: {
  chatId: string;
  peerUserId: string;
  video: boolean;
  onRemoteStream?: (stream: MediaStream) => void;
  onState?: (state: string) => void;
}): Promise<void> {
  await endCall({ notifyPeer: false });
  await ensureCallSocketConnected();
  const localStream = await navigator.mediaDevices.getUserMedia({
    audio: true,
    video: opts.video,
  });
  active = setupPeerConnection({ ...opts, role: "caller", localStream });

  const rang = emitCallRing(opts.peerUserId, opts.chatId, opts.video);
  if (!rang) {
    throw new Error("CALL_SOCKET_OFFLINE");
  }
  /* WebRTC offer يُرسل بعد call:accept من الطرف الآخر */
}

export function getActiveLocalStream(): MediaStream | null {
  return active?.localStream ?? null;
}

export function getActiveRemoteStream(): MediaStream | null {
  return active?.remoteStream ?? null;
}

export function setLocalAudioMuted(muted: boolean): void {
  for (const t of active?.localStream.getAudioTracks() ?? []) {
    t.enabled = !muted;
  }
}

export async function endCall(opts?: { notifyPeer?: boolean }): Promise<void> {
  if (!active) return;
  const { pc, localStream, peerUserId, chatId } = active;
  if (opts?.notifyPeer !== false && socketRef?.connected) {
    socketRef.emit("call:hangup", { toUserId: peerUserId, chatId });
  }
  for (const t of localStream.getTracks()) t.stop();
  pc.close();
  active = null;
  pendingSignals.clear();
}
