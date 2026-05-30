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
      /** body = يتقلص محتوى الويب فوق الكيبورد (شريط الكتابة يلتصق تلقائياً) */
      resize: "body",
    },
  },
  ios: {
    contentInset: "never",
    scrollEnabled: false,
    allowsLinkPreview: false,
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
