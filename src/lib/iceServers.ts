import { apiBackendEnabled, ensureApiRuntimeConfig, getApiBaseUrl } from "./apiBackend";

export type IceServerDef = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

let cached: RTCIceServer[] | null = null;
let loadPromise: Promise<RTCIceServer[]> | null = null;

function fromViteEnv(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ];
  const turnUrl = (import.meta.env.VITE_TURN_URL as string | undefined)?.trim();
  const turnUser = (import.meta.env.VITE_TURN_USERNAME as string | undefined)?.trim();
  const turnCred = (import.meta.env.VITE_TURN_CREDENTIAL as string | undefined)?.trim();
  if (turnUrl) {
    servers.push({
      urls: turnUrl,
      ...(turnUser ? { username: turnUser } : {}),
      ...(turnCred ? { credential: turnCred } : {}),
    });
  }
  return servers;
}

async function fetchFromApi(): Promise<RTCIceServer[] | null> {
  if (!apiBackendEnabled()) return null;
  try {
    await ensureApiRuntimeConfig();
    const base = getApiBaseUrl().replace(/\/$/, "");
    if (!base) return null;
    const res = await fetch(`${base}/v1/webrtc/ice-config`, { credentials: "include" });
    if (!res.ok) return null;
    const data = (await res.json()) as { iceServers?: IceServerDef[] };
    if (!Array.isArray(data.iceServers) || !data.iceServers.length) return null;
    return data.iceServers as RTCIceServer[];
  } catch {
    return null;
  }
}

/** STUN + TURN من السيرفر (أولوية) أو VITE_TURN_* عند البناء */
export async function resolveIceServers(): Promise<RTCIceServer[]> {
  if (cached) return cached;
  if (!loadPromise) {
    loadPromise = (async () => {
      const remote = await fetchFromApi();
      cached = remote?.length ? remote : fromViteEnv();
      return cached;
    })();
  }
  return loadPromise;
}

/** @deprecated استخدم resolveIceServers قبل إنشاء RTCPeerConnection */
export function buildIceServers(): RTCIceServer[] {
  return cached ?? fromViteEnv();
}

export function resetIceServersCache(): void {
  cached = null;
  loadPromise = null;
}
