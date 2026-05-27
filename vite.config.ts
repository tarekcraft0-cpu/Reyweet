// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
// @cloudflare/vite-plugin builds from this — wrangler.jsonc main alone is insufficient.
function devLanHmr() {
  const host = process.env.DEV_LAN_HOST?.trim();
  if (!host) return undefined;
  return { host, protocol: "ws" as const, clientPort: 3077 };
}

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    server: {
      host: true,
      port: 3077,
      strictPort: true,
      hmr: devLanHmr(),
      /** نفس بروكسي SPA — ربط الواجهة :3077 بـ API :3000 وقاعدة D: */
      proxy: {
        "/auth": { target: "http://127.0.0.1:3000", changeOrigin: true },
        "/v1": { target: "http://127.0.0.1:3000", changeOrigin: true },
        "/health": { target: "http://127.0.0.1:3000", changeOrigin: true },
        "/media": { target: "http://127.0.0.1:3000", changeOrigin: true },
        "/socket.io": { target: "http://127.0.0.1:3000", changeOrigin: true, ws: true },
      },
    },
  },
});
