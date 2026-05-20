import type { ConfigContext, ExpoConfig } from "expo/config";

const bundleId = "com.retweetmobile.app";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Retweet",
  slug: "retweet-mobile",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: "retweet",
  userInterfaceStyle: "light",
  newArchEnabled: true,
  owner: "tareqg123",
  extra: {
    apiUrl: "https://fiscal-compromise-energy-pichunter.trycloudflare.com",
    webAppUrl: "https://reyweet.vercel.app/app",
    webDevPort: 3077,
    eas: {
      projectId: "c729b1ff-0998-46dc-9649-0bc261332423",
    },
    ...(config.extra as object),
  },
  splash: {
    image: "./assets/images/splash-icon.png",
    resizeMode: "contain",
    backgroundColor: "#ffffff",
  },
  ios: {
    bundleIdentifier: bundleId,
    buildNumber: "1",
    supportsTablet: true,
    config: {
      usesNonExemptEncryption: false,
    },
    infoPlist: {
      CFBundleDisplayName: "Retweet",
      NSMicrophoneUsageDescription:
        "يُستخدم الميكروفون لتسجيل الرسائل الصوتية في المحادثات.",
      NSCameraUsageDescription: "يُستخدم الكاميرا عند التقاط صور داخل التطبيق.",
      NSPhotoLibraryUsageDescription:
        "يُستخدم للوصول إلى الصور عند مشاركتها في التطبيق.",
      UIBackgroundModes: ["audio"],
      ITSAppUsesNonExemptEncryption: false,
      NSAppTransportSecurity: {
        NSAllowsLocalNetworking: true,
      },
    },
  },
  android: {
    package: bundleId,
    versionCode: 1,
    permissions: ["RECORD_AUDIO"],
    usesCleartextTraffic: true,
    adaptiveIcon: {
      foregroundImage: "./assets/images/adaptive-icon.png",
      backgroundColor: "#ffffff",
    },
  },
  web: {
    bundler: "metro",
    output: "static",
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    "expo-router",
    [
      "expo-build-properties",
      {
        ios: {
          deploymentTarget: "15.1",
        },
      },
    ],
  ],
});
