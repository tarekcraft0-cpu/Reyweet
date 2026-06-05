/**
 * بروكسي API آمن: Vercel → VPS مع رأس ingress سري (لا يمكن تزويره من الخارج).
 * rewrite: /v1/* و /auth/* (عدا rt-ws) → /api/backend-proxy
 */
import crypto from "node:crypto";
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

function ingressSecret() {
  return (process.env.RETWEET_INGRESS_SECRET || process.env.RETWEET_APP_SIGNING_SECRET || "")
    .trim();
}

function ingressHeaders() {
  const secret = ingressSecret();
  if (!secret || secret.length < 16) return {};
  const t = Date.now().toString();
  const sig = crypto.createHmac("sha256", secret).update(t).digest("hex");
  return {
    "X-Retweet-Ingress-Time": t,
    "X-Retweet-Ingress-Sig": sig,
  };
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
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-Device-Fingerprint, X-Device-Label, X-Retweet-Client, X-Retweet-App-Time, X-Retweet-App-Sig",
    );
    res.statusCode = 204;
    return res.end();
  }

  const url = new URL(req.url || "/", "http://localhost");
  const route = String(url.searchParams.get("route") || "").trim();
  const subpath = String(url.searchParams.get("path") || "").replace(/^\/+/, "");
  if (!route || !/^(v1|auth)$/.test(route)) {
    res.statusCode = 400;
    return res.end("Bad route");
  }
  if (subpath.includes("..") || subpath.includes("\\")) {
    res.statusCode = 400;
    return res.end("Bad path");
  }

  url.searchParams.delete("route");
  url.searchParams.delete("path");
  const qs = url.searchParams.toString();
  const targetPath = subpath ? `/${route}/${subpath}` : `/${route}`;
  const target = `${backendBase()}${targetPath}${qs ? `?${qs}` : ""}`;

  /** @type {Record<string, string>} */
  const headers = { ...ingressHeaders() };
  const auth = req.headers.authorization;
  if (auth) headers.Authorization = String(auth);
  for (const h of [
    "content-type",
    "x-device-fingerprint",
    "x-device-label",
    "x-retweet-client",
    "x-retweet-app-time",
    "x-retweet-app-sig",
    "accept-language",
    "user-agent",
  ]) {
    const v = req.headers[h];
    if (v) headers[h] = Array.isArray(v) ? v.join(", ") : String(v);
  }

  const method = req.method || "GET";
  let body;
  if (method !== "GET" && method !== "HEAD") {
    body = await readBody(req);
    if (!headers["content-type"] && body.length) {
      headers["content-type"] = "application/json";
    }
  }

  let upstream;
  try {
    upstream = await fetch(target, {
      method,
      headers,
      body: body?.length ? body : undefined,
      redirect: "follow",
    });
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

  if (method === "HEAD" || upstream.status === 204 || !upstream.body) {
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
