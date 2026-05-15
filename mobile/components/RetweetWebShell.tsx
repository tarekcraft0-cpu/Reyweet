import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Linking from "expo-linking";
import WebView from "react-native-webview";

import { getWebAppUrl } from "@/lib/webAppUrl";

const LOAD_TIMEOUT_MS = 22_000;

/** يخبر Expo أن الصفحة جاهزة (أوثق من onLoadEnd مع Vite/HMR). */
const INJECT_READY_PROBE = `
(function () {
  function ping() {
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: "retweet-ready" }));
    }
  }
  if (document.readyState === "complete") ping();
  else window.addEventListener("load", ping, { once: true });
})();
true;
`;

export function RetweetWebShell() {
  const baseUrl = getWebAppUrl();
  const webRef = useRef<WebView>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [loading, setLoading] = useState(!!baseUrl);
  const [loadKey, setLoadKey] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);
  const hasShownContent = useRef(false);

  const onNavChange = useCallback((nav: { canGoBack?: boolean }) => {
    if (typeof nav.canGoBack === "boolean") setCanGoBack(nav.canGoBack);
  }, []);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (canGoBack && webRef.current) {
        webRef.current.goBack();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [canGoBack]);

  const retryLoad = useCallback(() => {
    setLastError(null);
    setLoading(true);
    hasShownContent.current = false;
    setLoadKey(k => k + 1);
  }, []);

  useEffect(() => {
    if (!baseUrl || !loading || lastError) return;
    const timer = setTimeout(() => {
      if (hasShownContent.current) return;
      setLoading(false);
      setLastError(
        "انتهت مهلة التحميل. تأكد أن npm run dev:lan يعمل على الكمبيوتر، وأن الآيفون على نفس Wi‑Fi، وجرّب فتح الرابط في Safari. قد تحتاج npm run open:dev-firewall كمسؤول.",
      );
    }, LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [baseUrl, loading, lastError, loadKey]);

  if (!baseUrl) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.configBox}>
          <Text style={styles.configTitle}>عرض تطبيق الويب داخل Expo</Text>
          <Text style={styles.configBody}>
            أضف عنوان خادم التطوير (نفس الرابط في المتصفح على الجوال)، مثلاً:{"\n\n"}
            في ملف ‎mobile/.env‎:{"\n"}
            EXPO_PUBLIC_WEB_APP_URL=http://192.168.x.x:3077{"\n\n"}
            (المنفذ ثابت في المشروع: ‎npm run dev:lan‎ يستخدم ‎3077‎ — إن تعارض مع تطبيق آخر غيّر المنفذ في ‎package.json‎ وفي ‎mobile/.env‎ معاً.){"\n\n"}
            أو في ‎app.json → expo.extra.webAppUrl‎.{"\n\n"}
            على الكمبيوتر من جذر المشروع شغّل:{"\n"}
            npm run dev:lan{"\n\n"}
            ثم أعد تشغيل Expo: npx expo start -c
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (lastError) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.fullError}>
          <Text style={styles.fullErrorTitle}>تعذر فتح تطبيق الويب</Text>
          <Text style={styles.fullErrorMsg}>{lastError}</Text>
          <Text style={styles.fullErrorUrl} selectable>
            {baseUrl}
          </Text>
          <Text style={styles.fullErrorSteps}>
            {"١) على الكمبيوتر من جذر مشروع Retweet (ليس مجلد mobile فقط): npm run dev:lan\n\n"}
            {"٢) في مجلد mobile: npm start ثم امسح الرمز من جديد.\n\n"}
            {"٣) إن بقي الخطأ: شغّل PowerShell كمسؤول ثم npm run open:dev-firewall\n\n"}
            {"٤) جرّب فتح الرابط أعلاه من Safari على الآيفون — إن لم يفتح، المشكلة شبكة أو IP وليس Expo."}
          </Text>
          <Pressable style={styles.retryBtn} onPress={retryLoad}>
            <Text style={styles.retryBtnText}>إعادة المحاولة</Text>
          </Pressable>
          <Pressable
            style={[styles.retryBtn, styles.secondaryBtn]}
            onPress={() => void Linking.openURL(baseUrl)}
          >
            <Text style={[styles.retryBtnText, styles.secondaryBtnText]}>فتح الرابط في Safari</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.column}>
        <WebView
          key={loadKey}
          ref={webRef}
          source={{ uri: baseUrl }}
          style={styles.web}
          onLoadStart={() => {
            if (!hasShownContent.current) setLoading(true);
            setLastError(null);
          }}
          onLoadEnd={() => {
            hasShownContent.current = true;
            setLoading(false);
          }}
          onLoadProgress={e => {
            if (e.nativeEvent.progress >= 0.9) {
              hasShownContent.current = true;
              setLoading(false);
            }
          }}
          onMessage={e => {
            try {
              const data = JSON.parse(e.nativeEvent.data) as { type?: string };
              if (data.type === "retweet-ready") {
                hasShownContent.current = true;
                setLoading(false);
              }
            } catch {
              /* ignore */
            }
          }}
          injectedJavaScript={INJECT_READY_PROBE}
          onNavigationStateChange={onNavChange}
          onError={e => {
            setLoading(false);
            const raw = e.nativeEvent.description || "";
            const code = (e.nativeEvent as { code?: number }).code;
            const isTimeout =
              code === -1001 ||
              /-1001/i.test(raw) ||
              /timed out/i.test(raw) ||
              /انتهت مهلة/i.test(raw);
            setLastError(
              isTimeout
                ? "انتهت مهلة الطلب: الآيفون لا يصل لعنوان الويب أعلاه. غالباً خادم Vite غير شغّال أو جدار الحماية يمنع المنفذ 3077."
                : raw || "تعذر التحميل",
            );
          }}
          onHttpError={e => {
            if (e.nativeEvent.statusCode >= 400) {
              setLastError(`HTTP ${e.nativeEvent.statusCode}`);
            }
          }}
          javaScriptEnabled
          domStorageEnabled
          allowsBackForwardNavigationGestures
          setSupportMultipleWindows={false}
          originWhitelist={["*"]}
          mixedContentMode="always"
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
        />
      </View>
      {loading ? (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#0a0a0a" />
          <Text style={styles.loadingText}>جاري تحميل Retweet…</Text>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#ffffff" },
  column: { flex: 1 },
  web: { flex: 1, backgroundColor: "#ffffff" },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.92)",
    zIndex: 20,
  },
  loadingText: { marginTop: 12, fontSize: 15, color: "#404040" },
  configBox: { padding: 20 },
  configTitle: { fontSize: 18, fontWeight: "700", marginBottom: 12, color: "#0a0a0a", textAlign: "center" },
  configBody: { fontSize: 14, lineHeight: 22, color: "#404040", textAlign: "left", writingDirection: "rtl" },
  fullError: {
    flex: 1,
    paddingHorizontal: 20,
    paddingVertical: 16,
    justifyContent: "center",
  },
  fullErrorTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0a0a0a",
    textAlign: "center",
    marginBottom: 14,
    writingDirection: "rtl",
  },
  fullErrorMsg: {
    fontSize: 14,
    lineHeight: 22,
    color: "#b91c1c",
    textAlign: "center",
    marginBottom: 12,
    writingDirection: "rtl",
  },
  fullErrorUrl: {
    fontSize: 12,
    color: "#525252",
    textAlign: "center",
    marginBottom: 16,
    fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }),
  },
  fullErrorSteps: {
    fontSize: 14,
    lineHeight: 22,
    color: "#404040",
    textAlign: "right",
    writingDirection: "rtl",
    marginBottom: 22,
  },
  retryBtn: {
    alignSelf: "center",
    backgroundColor: "#0a0a0a",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    marginBottom: 10,
    minWidth: 200,
    alignItems: "center",
  },
  secondaryBtn: {
    backgroundColor: "#f5f5f5",
    borderWidth: 1,
    borderColor: "#d4d4d4",
  },
  retryBtnText: { color: "#fff", fontWeight: "600", fontSize: 15 },
  secondaryBtnText: { color: "#0a0a0a" },
});
