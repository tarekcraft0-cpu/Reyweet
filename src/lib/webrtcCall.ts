import type { Socket } from "socket.io-client";

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

export function bindCallSocket(socket: Socket | null): void {
  socketRef = socket;
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
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
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
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
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

export async function endCall(): Promise<void> {
  if (!active) return;
  const { pc, localStream } = active;
  for (const t of localStream.getTracks()) t.stop();
  pc.close();
  active = null;
}
