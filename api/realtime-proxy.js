/**
 * بروكسي Socket.io (polling) عبر Vercel — يعمل على reyweet.vercel.app حيث rewrite /realtime قد يفشل.
 * العميل: path: "/api/realtime-proxy" → VPS: path: "/realtime"
 */
export const config = {
  maxDuration: 60,
};

function backendBase() {
  return (
    process.env.RETWEET_BACKEND_URL ||
    process.env.MEDIA_PROXY_BACKEND ||
    "http://109.199.111.29"
  )
    .trim()
    .replace(/\/$/, "");
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", c => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

/** @param {import('http').IncomingMessage} req */
/** @param {import('http').ServerResponse} res */
export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.statusCode = 204;
    return res.end();
  }

  const qs = req.url?.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  const target = `${backendBase()}/realtime${qs}`;

  /** @type {Record<string, string>} */
  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) {
    const lk = k.toLowerCase();
    if (["host", "connection", "content-length", "transfer-encoding"].includes(lk)) continue;
    if (typeof v === "string") headers[k] = v;
  }

  let body;
  if (req.method !== "GET" && req.method !== "HEAD") {
    try {
      body = await readBody(req);
    } catch {
      res.statusCode = 400;
      return res.end("Bad body");
    }
  }

  let upstream;
  try {
    upstream = await fetch(target, { method: req.method || "GET", headers, body });
  } catch {
    res.statusCode = 502;
    return res.end("Upstream unreachable");
  }

  const hopByHop = new Set(["connection", "keep-alive", "transfer-encoding", "te", "trailer", "upgrade"]);
  res.statusCode = upstream.status;
  for (const [k, v] of upstream.headers.entries()) {
    if (hopByHop.has(k.toLowerCase())) continue;
    res.setHeader(k, v);
  }
  res.setHeader("Access-Control-Allow-Origin", "*");

  const buf = Buffer.from(await upstream.arrayBuffer());
  return res.end(buf);
}
