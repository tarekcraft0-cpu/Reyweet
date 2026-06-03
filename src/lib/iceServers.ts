/** STUN + TURN اختياري — عيّن VITE_TURN_URL و VITE_TURN_USERNAME و VITE_TURN_CREDENTIAL عند البناء */
export function buildIceServers(): RTCIceServer[] {
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
