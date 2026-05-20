/** تكامل مع غلاف Expo (WebView) — تسجيل صوت أصلي لأن HTTP لا يدعم getUserMedia على iOS. */

export function isReactNativeWebView(): boolean {
  if (typeof window === "undefined") return false;
  return !!(window as Window & { ReactNativeWebView?: { postMessage: (s: string) => void } }).ReactNativeWebView;
}

export function postToNativeShell(payload: Record<string, unknown>): void {
  const bridge = (window as Window & { ReactNativeWebView?: { postMessage: (s: string) => void } })
    .ReactNativeWebView;
  bridge?.postMessage(JSON.stringify(payload));
}

export type VoiceRecordedPayload = { content: string; durationSec: number };

declare global {
  interface Window {
    retweetOnVoiceRecorded?: (payload: VoiceRecordedPayload) => void;
    retweetOnVoiceRecordError?: (message: string) => void;
  }
}
