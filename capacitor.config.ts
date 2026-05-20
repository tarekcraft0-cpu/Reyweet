import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.retweetmobile.app",
  appName: "Retweet",
  webDir: "spa-dist",
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
