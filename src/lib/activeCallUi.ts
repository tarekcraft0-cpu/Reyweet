import type { IncomingCallRing } from "./webrtcCall";

export const INCOMING_CALL_WINDOW_EVENT = "retweet-call-ring";
export const START_OUTGOING_CALL_EVENT = "retweet-start-outgoing-call";
export const CALL_UI_ENDED_EVENT = "retweet-call-ui-ended";

export type OutgoingCallDetail = {
  chatId: string;
  video: boolean;
  peerUserId: string;
};

export function dispatchIncomingCallRing(detail: IncomingCallRing): void {
  window.dispatchEvent(new CustomEvent(INCOMING_CALL_WINDOW_EVENT, { detail }));
}

export function dispatchStartOutgoingCall(detail: OutgoingCallDetail): void {
  window.dispatchEvent(new CustomEvent(START_OUTGOING_CALL_EVENT, { detail }));
}

export function dispatchCallUiEnded(): void {
  window.dispatchEvent(new CustomEvent(CALL_UI_ENDED_EVENT));
}
