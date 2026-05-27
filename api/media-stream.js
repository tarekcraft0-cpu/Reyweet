/**
 * بروكسي وسائط + تمرير Range (للفيديو/الريلز على HTTPS عبر Vercel).
 * الاستدعاء: GET /api/media-stream?path=videos/foo.mp4
 * يوجّه إلى RETWEET_BACKEND_URL/media/path
 */
import { Readable } from "node:stream";

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

/** @param {import('http').IncomingMessage} req */
/** @param {import('http').ServerResponse} res */
export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Range, If-Range");
    res.statusCode = 204;
    return res.end();
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.statusCode = 405;
    return res.end("Method Not Allowed");
  }

  const raw =
    typeof req.query?.path === "string"
      ? req.query.path
      : Array.isArray(req.query?.path)
        ? req.query.path.join("/")
        : "";
  const parts = String(raw || "")
    .split("/")
    .filter(Boolean);

  if (!parts.length || parts.some(p => p.includes("..") || p.includes("\\") || p === ".")) {
    res.statusCode = 400;
    return res.end("Bad path");
  }

  const pathEncoded = parts.map(s => encodeURIComponent(s)).join("/");
  const url = `${backendBase()}/media/${pathEncoded}`;

  /** @type {Record<string, string>} */
  const headers = {};
  if (req.headers.range) headers.Range = req.headers.range;
  const ifRange = req.headers["if-range"];
  if (ifRange) headers["If-Range"] = ifRange;

  let upstream;
  try {
    upstream = await fetch(url, { method: req.method, headers, redirect: "follow" });
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
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");

  if (req.method === "HEAD" || upstream.status === 204 || !upstream.body) {
    return res.end();
  }

  try {
    const nodeStream = Readable.fromWeb(upstream.body);
    nodeStream.on("error", () => {
      if (!res.writableEnded) res.destroy();
    });
    nodeStream.pipe(res);
  } catch {
    const buf = await upstream.arrayBuffer();
    res.end(Buffer.from(buf));
  }
}
