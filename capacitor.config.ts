import type { CapacitorConfig } from "@capacitor/cli";

/** مُولَّد — شغّل: npm run ios:prepare */
const config: CapacitorConfig = {
  appId: "com.retweetmobile.app",
  appName: "Retweet",
  webDir: "spa-dist",
  bundledWebRuntime: false,
  server: {
    url: "https://reyweet.vercel.app/app/",
    cleartext: false,
    androidScheme: "https",
  },
  ios: {
    contentInset: "automatic",
    allowsLinkPreview: false,
  },
};

export default config;
