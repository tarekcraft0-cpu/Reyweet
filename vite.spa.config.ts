import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.resolve(rootDir, "src");

function readWebsiteConfig(): { apiUrl: string; supabaseUrl: string; supabaseKey: string } {
  const candidates = [
    path.join(rootDir, "landing/public/app-config.json"),
    path.join(rootDir, "spa/public/web-auth-config.json"),
  ];
  let apiUrl = "";
  let supabaseUrl = "";
  let supabaseKey = "";
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    try {
      const j = JSON.parse(readFileSync(p, "utf8")) as {
        apiUrl?: string;
        supabaseUrl?: string;
        supabaseAnonKey?: string;
      };
      if (!apiUrl && j.apiUrl) apiUrl = j.apiUrl.trim().replace(/\/$/, "");
      const url = (j.supabaseUrl || "").trim().replace(/\/$/, "");
      const key = (j.supabaseAnonKey || "").trim();
      if (url && key) {
        supabaseUrl = url;
        supabaseKey = key;
      }
    } catch {
      /* try next */
    }
  }
  return { apiUrl, supabaseUrl, supabaseKey };
}

function isPrivateApiUrl(url: string): boolean {
  const u = url.trim();
  if (!u) return false;
  try {
    const { hostname, protocol } = new URL(u);
    if (protocol !== "http:" && protocol !== "https:") return false;
    if (hostname === "localhost" || hostname === "127.0.0.1") return true;
    if (/^192\.168\.\d{1,3}\.\d{1,3}$/i.test(hostname)) return true;
    if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/i.test(hostname)) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/i.test(hostname)) return true;
  } catch {
    return false;
  }
  return false;
}

/** بناء تطبيق الويب الثابت لمسار /app على Vercel */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, rootDir, "");
  const defaults = readWebsiteConfig();
  const onVercel = process.env.VERCEL === "1";
  const publicApi = (
    process.env.RETWEET_PUBLIC_API_URL ||
    env.RETWEET_PUBLIC_API_URL ||
    ""
  )
    .trim()
    .replace(/\/$/, "");
  const viteApi = (env.VITE_API_URL || process.env.VITE_API_URL || "").trim().replace(/\/$/, "");

  let apiUrl = "";
  if (onVercel) {
    apiUrl = publicApi || defaults.apiUrl;
    if (!apiUrl && viteApi && !isPrivateApiUrl(viteApi)) apiUrl = viteApi;
  } else {
    apiUrl = viteApi || publicApi || defaults.apiUrl;
  }
  const supabaseUrl = apiUrl
    ? ""
    : (env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL || defaults.supabaseUrl).trim();
  const supabaseKey = apiUrl
    ? ""
    : (
        env.VITE_SUPABASE_JWT_ANON ||
        env.VITE_SUPABASE_ANON_KEY ||
        process.env.VITE_SUPABASE_JWT_ANON ||
        process.env.VITE_SUPABASE_ANON_KEY ||
        defaults.supabaseKey
      ).trim();

  const capacitorNative = process.env.CAPACITOR_NATIVE === "1";

  return {
    root: path.resolve(rootDir, "spa"),
    envDir: rootDir,
    /** Capacitor يحمّل من capacitor://localhost — مسارات نسبية ./assets */
    base: capacitorNative ? "./" : "/app/",
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": srcDir,
      },
    },
    server: {
      host: "0.0.0.0",
      port: Number(process.env.SPA_DEV_PORT || 3080),
      strictPort: true,
      /** طلبات API عبر نفس المنفذ — يمنع «تعذر الاتصال» و CORS بين :3080 و :3000 */
      proxy: {
        "/auth": { target: "http://127.0.0.1:3000", changeOrigin: true },
        "/v1": { target: "http://127.0.0.1:3000", changeOrigin: true },
        "/health": { target: "http://127.0.0.1:3000", changeOrigin: true },
        "/media": { target: "http://127.0.0.1:3000", changeOrigin: true },
        "/socket.io": { target: "http://127.0.0.1:3000", changeOrigin: true, ws: true },
      },
    },
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(supabaseUrl),
      "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify(supabaseKey),
      /** في التطوير: فارغ = نفس الأصل + بروكسي Vite */
      "import.meta.env.VITE_API_URL": JSON.stringify(mode === "development" ? "" : apiUrl),
      "import.meta.env.VITE_API_URL_MOBILE": JSON.stringify(
        mode === "development" ? "" : apiUrl,
      ),
    },
    build: {
      outDir: path.resolve(rootDir, "spa-dist"),
      emptyOutDir: true,
    },
  };
});
