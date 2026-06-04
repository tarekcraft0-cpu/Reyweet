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

/** يتحقق من اتصال Socket قبل الرنين — يمنع «يدق ولا يصل للطرف الآخر» */
export async function dispatchStartOutgoingCallSafe(
  detail: OutgoingCallDetail,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (typeof window === "undefined") return { ok: false, error: "غير متاح" };
  try {
    const { waitForRealtimeSocket, isRealtimeSocketConnected } = await import("./realtimeSocket.js");
    if (!isRealtimeSocketConnected()) {
      const ready = await waitForRealtimeSocket(4000);
      if (!ready) {
        return {
          ok: false,
          error:
            "الاتصال الفوري غير جاهز. افتح التطبيق من جديد وتأكد أن الطرف الآخر داخل التطبيق (وليس ضيفاً)، ثم أعد المحاولة.",
        };
      }
    }
    dispatchStartOutgoingCall(detail);
    return { ok: true };
  } catch {
    return { ok: false, error: "تعذر بدء المكالمة" };
  }
}

export function dispatchCallUiEnded(): void {
  window.dispatchEvent(new CustomEvent(CALL_UI_ENDED_EVENT));
}
