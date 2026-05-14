import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.retweet.app",
  appName: "Retweet",
  webDir: "dist",
  bundledWebRuntime: false,
  server: {
    androidScheme: "https",
    /** لـ `http://` على الشبكة المحلية أثناء التطوير (عنوان API على الهاتف) — عطّله في الإنتاج واستخدم HTTPS */
    cleartext: true,
  },
};

export default config;

