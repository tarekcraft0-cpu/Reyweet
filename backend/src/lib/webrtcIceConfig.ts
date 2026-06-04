/** إعداد STUN/TURN للمكالمات — من متغيرات البيئة على VPS */
export type IceServerDef = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

export type IceConfigResponse = {
  iceServers: IceServerDef[];
  turnConfigured: boolean;
};

function parseTurnUrls(): string[] {
  const multi = process.env.TURN_URLS?.trim();
  if (multi) {
    return multi
      .split(/[,;\s]+/)
      .map(s => s.trim())
      .filter(Boolean);
  }
  const single = process.env.TURN_URL?.trim();
  return single ? [single] : [];
}

export function buildIceConfigFromEnv(): IceConfigResponse {
  const iceServers: IceServerDef[] = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ];
  const turnUrls = parseTurnUrls();
  const turnUser = process.env.TURN_USERNAME?.trim();
  const turnCred = process.env.TURN_CREDENTIAL?.trim();
  if (turnUrls.length) {
    iceServers.push({
      urls: turnUrls.length === 1 ? turnUrls[0]! : turnUrls,
      ...(turnUser ? { username: turnUser } : {}),
      ...(turnCred ? { credential: turnCred } : {}),
    });
  }
  return { iceServers, turnConfigured: turnUrls.length > 0 && Boolean(turnCred) };
}
