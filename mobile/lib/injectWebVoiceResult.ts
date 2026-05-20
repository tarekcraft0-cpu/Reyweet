import type { RefObject } from "react";
import type WebView from "react-native-webview";

export function injectVoiceRecorded(
  webRef: RefObject<WebView | null>,
  payload: { content: string; durationSec: number },
) {
  const json = JSON.stringify(payload);
  webRef.current?.injectJavaScript(`
    (function () {
      if (typeof window.retweetOnVoiceRecorded === "function") {
        window.retweetOnVoiceRecorded(${json});
      }
    })();
    true;
  `);
}

export function injectVoiceRecordError(webRef: RefObject<WebView | null>, message: string) {
  const json = JSON.stringify(message);
  webRef.current?.injectJavaScript(`
    (function () {
      if (typeof window.retweetOnVoiceRecordError === "function") {
        window.retweetOnVoiceRecordError(${json});
      } else {
        alert(${json});
      }
    })();
    true;
  `);
}
