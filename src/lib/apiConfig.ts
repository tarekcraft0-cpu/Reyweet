/**
 * تحديد عنوان Retweet API — بروكسي Vite / نفس الأصل (نفق) / LAN.
 */
import {
  isLanOrLocalHostname,
  isPrivateApiUrl,
  isPublicAppHost,
  isTunnelPublicHost,
} from "./apiUrlPolicy";

const API_RUNTIME_KEY = "retweet_web_api_config";

let resolvedMode: "unset" | "relative" | "absolute" = "unset";
let resolvedAbsoluteUrl = "";

function trimUrl(raw: string | undefined): string {
  return (raw || "").trim().replace(/\/$/, "");
}

export function useViteDevProxy(): boolean {
  if (typeof window === "undefined") return false;
  const port = window.location.port;
  return port === "3080" || port === "3077" || port === "5173";
}

/** عند Vite (:3077 / :3080) نمرّر API عبر نفس الأصل (بروكسي → :3000). */
export function viteDevWebOrigin(): string {
  if (typeof window === "undefined") return "";
  if (!useViteDevProxy() || !onAppPath()) return "";
  return window.location.origin.replace(/\/$/, "");
}

/** عنوان API الذي يستعمله WebView — نفس منفذ الواجهة في التطوير المحلي. */
export function resolveApiUrlForWebView(webAppUrl: string, fallbackApiUrl: string): string {
  const fb = trimUrl(fallbackApiUrl);
  try {
    const u = new URL(trimUrl(webAppUrl) || "http://local/");
    if (u.port === "3077" || u.port === "3080") return u.origin.replace(/\/$/, "");
  } catch {
    /* ignore */
  }
  const live = viteDevWebOrigin();
  if (live) return live;
  return fb;
}

/** مسار فحص صحة الخادم — يفضّل /health عبر بروكسي Vite عند التطوير. */
export function resolveHealthCheckUrl(): string {
  if (typeof window === "undefined") return "/health";
  const injected = trimUrl(
    (window as Window & { __RETWEET_API_URL__?: string }).__RETWEET_API_URL__,
  );
  const peek = peekApiBaseUrl();
  const viteOrigin = viteDevWebOrigin();
  if (viteOrigin) return "/health";
  if (injected) {
    try {
      const inj = new URL(injected);
      const here = new URL(window.location.href);
      if (inj.port === "3000" && (here.port === "3077" || here.port === "3080")) return "/health";
    } catch {
      /* ignore */
    }
    return `${injected.replace(/\/$/, "")}/health`;
  }
  if (peek) return `${peek.replace(/\/$/, "")}/health`;
  return "/health";
}

export async function probeHealth(): Promise<boolean> {
  const urls = [resolveHealthCheckUrl()];
  if (typeof window !== "undefined" && isLanOrLocalHostname(window.location.hostname)) {
    const h = window.location.hostname;
    urls.push(`http://${h}:3000/health`, "http://127.0.0.1:3000/health");
  }
  const seen = new Set<string>();
  for (const path of urls) {
    const key = path;
    if (seen.has(key)) continue;
    seen.add(key);
    if (await probeUrl(path.replace(/\/health$/, "").replace(/\/$/, "") || "")) return true;
  }
  return false;
}

function onAppPath(): boolean {
  if (typeof window === "undefined") return false;
  return (window.location.pathname || "").startsWith("/app");
}

/** خادم موحّد: landing + API على :3000 أو نفق trycloudflare (نفس الأصل) */
function useUnifiedLocalServer(): boolean {
  if (typeof window === "undefined") return false;
  if (!onAppPath()) return false;
  const { port, hostname } = window.location;
  if (port === "3000") return true;
  if (isTunnelPublicHost(hostname)) return true;
  return false;
}

export function clearStaleApiConfig(): void {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(API_RUNTIME_KEY);
    if (!raw) return;
    const j = JSON.parse(raw) as { apiUrl?: string };
    const u = trimUrl(j.apiUrl);
    if (!u) return;
    if (isPublicAppHost() && isPrivateApiUrl(u)) {
      localStorage.removeItem(API_RUNTIME_KEY);
      return;
    }
    if (
      isLanOrLocalHostname(window.location.hostname) &&
      (/\.trycloudflare\.com/i.test(u) || u.includes("vercel.app"))
    ) {
      localStorage.removeItem(API_RUNTIME_KEY);
      return;
    }
    if (useViteDevProxy() && u.includes(":3000")) {
      localStorage.removeItem(API_RUNTIME_KEY);
      return;
    }
    try {
      const storedOrigin = new URL(u).origin;
      if (storedOrigin !== window.location.origin) {
        localStorage.removeItem(API_RUNTIME_KEY);
      }
    } catch {
      localStorage.removeItem(API_RUNTIME_KEY);
    }
  } catch {
    localStorage.removeItem(API_RUNTIME_KEY);
  }
}

async function probeUrl(base: string): Promise<boolean> {
  const path = base ? `${trimUrl(base)}/health` : "/health";
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 8000);
    const res = await fetch(path, { signal: ctl.signal, cache: "no-store" });
    clearTimeout(t);
    if (!res.ok) return false;
    const j = (await res.json().catch(() => null)) as {
      ok?: boolean;
      dbOk?: boolean;
    } | null;
    return j?.ok === true && j?.dbOk !== false;
  } catch {
    return false;
  }
}

async function loadConfigFileUrls(): Promise<string[]> {
  if (typeof window === "undefined") return [];
  const base = (import.meta.env.BASE_URL as string | undefined) || "/app/";
  const root = base.endsWith("/") ? base : `${base}/`;
  const urls: string[] = [];
  for (const file of [
    `${root}web-auth-config.json`,
    `${window.location.origin}/app/web-auth-config.json`,
    `${window.location.origin}/public/app-config.json`,
  ]) {
    try {
      const res = await fetch(file, { cache: "no-store" });
      if (!res.ok) continue;
      const j = (await res.json()) as { apiUrl?: string };
      const u = trimUrl(j.apiUrl);
      if (!u) continue;
      if (isPublicAppHost() && isPrivateApiUrl(u)) continue;
      if (isTunnelPublicHost() && new URL(u).origin !== window.location.origin) continue;
      urls.push(u);
    } catch {
      /* ignore */
    }
  }
  return urls;
}

function persistAbsolute(url: string): void {
  if (!url || typeof window === "undefined") return;
  try {
    localStorage.setItem(API_RUNTIME_KEY, JSON.stringify({ apiUrl: url }));
  } catch {
    /* ignore */
  }
}

async function resolveSameOriginApi(): Promise<string | null> {
  if (await probeUrl("")) {
    resolvedMode = "relative";
    resolvedAbsoluteUrl = "";
    return "";
  }
  const origin = window.location.origin;
  if (await probeUrl(origin)) {
    resolvedMode = "absolute";
    resolvedAbsoluteUrl = origin;
    persistAbsolute(origin);
    return origin;
  }
  return null;
}

export async function ensureApiRuntimeConfig(): Promise<string> {
  clearStaleApiConfig();

  if (typeof window !== "undefined") {
    const injected = (window as Window & { __RETWEET_API_URL__?: string }).__RETWEET_API_URL__;
    let skipInjected = false;
    if (injected?.startsWith("http") && useViteDevProxy() && onAppPath()) {
      try {
        if (new URL(injected).port === "3000") skipInjected = true;
      } catch {
        /* ignore */
      }
    }
    if (injected?.startsWith("http") && !skipInjected) {
      const u = injected.replace(/\/$/, "");
      if (!(isPublicAppHost() && isPrivateApiUrl(u)) && (await probeUrl(u))) {
        resolvedMode = "absolute";
        resolvedAbsoluteUrl = u;
        persistAbsolute(u);
        return u;
      }
    }
  }

  if (resolvedMode !== "unset") {
    return resolvedMode === "relative" ? "" : resolvedAbsoluteUrl;
  }

  if (useViteDevProxy() && onAppPath()) {
    const r = await resolveSameOriginApi();
    if (r !== null) return r;
  }

  if (useUnifiedLocalServer()) {
    const r = await resolveSameOriginApi();
    if (r !== null) return r;
  }

  const fileUrls = await loadConfigFileUrls();

  if (isPublicAppHost() && onAppPath()) {
    for (const u of fileUrls) {
      if (await probeUrl(u)) {
        resolvedMode = "absolute";
        resolvedAbsoluteUrl = u;
        persistAbsolute(u);
        return u;
      }
    }
  }

  const candidates = [
    ...fileUrls,
    trimUrl(import.meta.env.VITE_API_URL as string | undefined),
    ...((() => {
      try {
        const raw = localStorage.getItem(API_RUNTIME_KEY);
        if (!raw) return [];
        const j = JSON.parse(raw) as { apiUrl?: string };
        const u = trimUrl(j.apiUrl);
        return u ? [u] : [];
      } catch {
        return [];
      }
    })()),
  ];

  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (isLanOrLocalHostname(host)) {
      candidates.push(
        `http://${host}:3000`,
        "http://127.0.0.1:3000",
        "http://localhost:3000",
      );
    }
  }

  const seen = new Set<string>();
  for (const raw of candidates) {
    const u = trimUrl(raw);
    if (!u || seen.has(u)) continue;
    seen.add(u);
    if (isPublicAppHost() && isPrivateApiUrl(u)) continue;
    if (isTunnelPublicHost()) {
      try {
        if (new URL(u).origin !== window.location.origin) continue;
      } catch {
        continue;
      }
    }
    if (await probeUrl(u)) {
      resolvedMode = "absolute";
      resolvedAbsoluteUrl = u;
      persistAbsolute(u);
      return u;
    }
  }

  if (onAppPath() && isTunnelPublicHost()) {
    const r = await resolveSameOriginApi();
    if (r !== null) return r;
  }

  resolvedMode = "relative";
  resolvedAbsoluteUrl = "";
  return "";
}

export function peekApiBaseUrl(): string {
  if (resolvedMode === "relative") return "";
  if (resolvedMode === "absolute") return resolvedAbsoluteUrl;
  if (useViteDevProxy() && onAppPath()) return "";
  if (useUnifiedLocalServer() || (onAppPath() && isTunnelPublicHost())) return "";
  const fromBuild = trimUrl(import.meta.env.VITE_API_URL as string | undefined);
  if (fromBuild && !(isPublicAppHost() && isPrivateApiUrl(fromBuild))) return fromBuild;
  if (typeof window !== "undefined") {
    const h = window.location.hostname;
    if (isLanOrLocalHostname(h)) return `http://${h}:3000`;
  }
  return "";
}

export function defaultDevApiUrl(): string {
  if (useViteDevProxy()) return "";
  if (typeof window !== "undefined" && isTunnelPublicHost()) return "";
  const h = typeof window !== "undefined" ? window.location.hostname : "localhost";
  if (isLanOrLocalHostname(h)) return `http://${h}:3000`;
  return "";
}
