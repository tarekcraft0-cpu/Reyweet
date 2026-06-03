import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Reyweet mobile app (iOS / Android).
 * Web UI is built with `npm run build:spa` and copied to `dist/` by `npm run ios:prepare`.
 * Do not set `server.url` for production — assets must be bundled inside the native binary.
 */
const config: CapacitorConfig = {
  appId: "com.reyweet.app",
  appName: "Reyweet",
  webDir: "dist",
  plugins: {
    Keyboard: {
      /** none على iOS — resize:body + ضبط viewport يسبب حلقة قياس في react-virtual (#185) */
      resize: "none",
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
  ios: {
    contentInset: "never",
    /** true — ضروري لتمرير .chat-scroll-pane داخل WKWebView؛ false يجمّد المحادثة على IPA */
    scrollEnabled: true,
    allowsLinkPreview: false,
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
