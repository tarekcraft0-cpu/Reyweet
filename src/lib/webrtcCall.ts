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

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

type ActiveCall = {
  chatId: string;
  peerUserId: string;
  video: boolean;
  pc: RTCPeerConnection;
  localStream: MediaStream;
  remoteStream: MediaStream | null;
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
} | null {
  if (!active) return null;
  return {
    chatId: active.chatId,
    peerUserId: active.peerUserId,
    video: active.video,
  };
}

export function bindCallSocket(socket: Socket | null): void {
  if (socketRef) {
    socketRef.off("call:ended");
    socketRef.off("call:reject");
  }
  socketRef = socket;
  if (!socket) return;
  socket.on("call:ended", () => {
    void endCall({ notifyPeer: false });
    import("./activeCallUi.js").then(m => m.dispatchCallUiEnded());
  });
  socket.on("call:reject", () => {
    import("./activeCallUi.js").then(m => m.dispatchCallUiEnded());
  });
}

export function emitCallReject(toUserId: string, chatId: string): void {
  if (!socketRef?.connected) return;
  socketRef.emit("call:reject", { toUserId, chatId });
}

export function emitCallRing(toUserId: string, chatId: string, video: boolean): void {
  if (!socketRef?.connected) return;
  socketRef.emit("call:ring", { toUserId, chatId, video });
}

function emitSignal(toUserId: string, chatId: string, signal: unknown): void {
  if (!socketRef?.connected) return;
  socketRef.emit("call:signal", { toUserId, chatId, signal });
}

export async function handleRemoteCallSignal(payload: CallSignalPayload): Promise<void> {
  if (!active || active.chatId !== payload.chatId || active.peerUserId !== payload.fromUserId) {
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
  await endCall();
  const localStream = await navigator.mediaDevices.getUserMedia({
    audio: true,
    video: opts.video,
  });
  const pc = new RTCPeerConnection({ iceServers: buildIceServers() });
  for (const track of localStream.getTracks()) {
    pc.addTrack(track, localStream);
  }
  const remoteStream = new MediaStream();
  pc.ontrack = ev => {
    if (ev.streams[0]) {
      for (const t of ev.streams[0].getTracks()) remoteStream.addTrack(t);
    } else if (ev.track) {
      remoteStream.addTrack(ev.track);
    }
    opts.onRemoteStream?.(remoteStream);
  };
  pc.onicecandidate = ev => {
    if (ev.candidate) {
      emitSignal(opts.peerUserId, opts.chatId, ev.candidate);
    }
  };
  pc.onconnectionstatechange = () => {
    opts.onState?.(pc.connectionState);
  };
  active = {
    chatId: opts.chatId,
    peerUserId: opts.peerUserId,
    video: opts.video,
    pc,
    localStream,
    remoteStream,
    onRemoteStream: opts.onRemoteStream,
    onState: opts.onState,
  };
  await flushBufferedSignals(opts.chatId, opts.peerUserId);
}

export async function startOutgoingCall(opts: {
  chatId: string;
  peerUserId: string;
  video: boolean;
  onRemoteStream?: (stream: MediaStream) => void;
  onState?: (state: string) => void;
}): Promise<void> {
  await endCall();
  const localStream = await navigator.mediaDevices.getUserMedia({
    audio: true,
    video: opts.video,
  });
  const pc = new RTCPeerConnection({ iceServers: buildIceServers() });
  for (const track of localStream.getTracks()) {
    pc.addTrack(track, localStream);
  }
  const remoteStream = new MediaStream();
  pc.ontrack = ev => {
    if (ev.streams[0]) {
      for (const t of ev.streams[0].getTracks()) remoteStream.addTrack(t);
    } else if (ev.track) {
      remoteStream.addTrack(ev.track);
    }
    opts.onRemoteStream?.(remoteStream);
  };
  pc.onicecandidate = ev => {
    if (ev.candidate) {
      emitSignal(opts.peerUserId, opts.chatId, ev.candidate);
    }
  };
  pc.onconnectionstatechange = () => {
    opts.onState?.(pc.connectionState);
  };

  active = {
    chatId: opts.chatId,
    peerUserId: opts.peerUserId,
    video: opts.video,
    pc,
    localStream,
    remoteStream,
    onRemoteStream: opts.onRemoteStream,
    onState: opts.onState,
  };

  emitCallRing(opts.peerUserId, opts.chatId, opts.video);

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  emitSignal(opts.peerUserId, opts.chatId, offer);
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
