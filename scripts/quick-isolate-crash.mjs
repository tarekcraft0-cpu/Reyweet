#!/usr/bin/env node
/** Isolate crash: perf on/off, wait for feed */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const PORT = 5197;

function mime(p) {
  if (p.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (p.endsWith(".css")) return "text/css; charset=utf-8";
  if (p.endsWith(".html")) return "text/html; charset=utf-8";
  return "application/octet-stream";
}

function startServer(dir) {
  return new Promise(resolve => {
    const s = http.createServer((req, res) => {
      let urlPath = decodeURIComponent(req.url?.split("?")[0] || "/");
      if (urlPath === "/health" || urlPath.startsWith("/v1/") || urlPath.startsWith("/auth/")) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end('{"ok":true,"posts":[],"users":[],"hasMore":false}');
        return;
      }
      if (urlPath === "/" || urlPath === "/app" || urlPath === "/app/") urlPath = "/index.html";
      if (urlPath.startsWith("/app/")) urlPath = urlPath.slice(4) || "/index.html";
      const fp = path.join(dir, urlPath === "/" ? "index.html" : urlPath);
      fs.readFile(fp, (e, d) => {
        if (e) { res.writeHead(404); res.end("404"); return; }
        res.writeHead(200, { "Content-Type": mime(fp) });
        res.end(d);
      });
    });
    s.listen(PORT, "127.0.0.1", () => resolve(s));
  });
}

const BENCH_USER_ID = "bench_user_local";
const seed = {
  currentUserId: BENCH_USER_ID,
  accountIds: [BENCH_USER_ID],
  users: [{
    id: BENCH_USER_ID, username: "bench", email: "b@t.l", password: "", bio: "", avatar: "👀",
    isPrivate: false, verified: false, followers: [], following: ["a1"],
    highlights: [], blocked: [], closeFriends: [], favorites: [], followRequestIn: [], followRequestOut: [],
  }, {
    id: "a1", username: "author", email: "a@t.l", password: "", bio: "", avatar: "",
    isPrivate: false, verified: false, followers: [BENCH_USER_ID], following: [],
    highlights: [], blocked: [], closeFriends: [], favorites: [], followRequestIn: [], followRequestOut: [],
  }],
  posts: Array.from({ length: 30 }, (_, i) => ({
    id: `p${i}`, userId: "a1", type: "post", text: `Post ${i}`, likes: [], reposts: [], comments: [],
    createdAt: Date.now() - i * 60000,
  })),
  stories: [], chats: [], notifications: [], mediaNotes: [], stickers: [], theme: "light", language: "ar",
};

async function runTest(perfOn) {
  const server = await startServer(path.join(root, "spa-dist"));
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", msg => {
    if (msg.type() === "error") errors.push(msg.text());
  });

  await page.setRequestInterception(true);
  page.on("request", req => {
    const u = req.url();
    if (u.startsWith("data:") || u.startsWith("blob:")) { req.continue(); return; }
    if (u.includes("127.0.0.1:5197")) { req.continue(); return; }
    if (u.includes("/health") || u.includes("/v1/") || u.includes("/auth/")) {
      req.respond({ status: 200, contentType: "application/json", body: '{"ok":true,"posts":[],"hasMore":false}' });
      return;
    }
    req.abort("blockedbyclient");
  });

  await page.evaluateOnNewDocument((s, perf) => {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith("retweet_")) localStorage.removeItem(k);
    }
    localStorage.setItem("retweet_perf", perf ? "1" : "0");
    localStorage.setItem("retweet_api_token", "test_token");
    localStorage.setItem("retweet_state_v2", JSON.stringify(s));
    localStorage.setItem("retweet_web_api_config", JSON.stringify({ apiUrl: `http://127.0.0.1:5197`, ts: Date.now() }));
  }, seed, perfOn);

  await page.goto(`http://127.0.0.1:${PORT}/app/`, { waitUntil: "networkidle2", timeout: 30000 });
  await new Promise(r => setTimeout(r, 2000));

  // Click bottom nav icons
  for (let i = 0; i < 5; i++) {
    await page.evaluate(idx => {
      const btns = [...document.querySelectorAll("button")].filter(
        b => b.closest("[class*='bottom']") || b.getAttribute("tabindex") === String(idx),
      );
      btns[idx]?.click();
    }, i);
    await new Promise(r => setTimeout(r, 500));
    const mid = await page.evaluate(() => document.body.innerText.includes("حدث خطأ في الواجهة"));
    if (mid) {
      console.log(`Crashed after nav click ${i}`);
      break;
    }
  }

  const info = await page.evaluate(() => ({
    crashed: document.body.innerText.includes("حدث خطأ في الواجهة"),
    feedCards: document.querySelectorAll(".feed-post-card").length,
    pre: document.querySelector("pre")?.innerText?.slice(0, 800) ?? "",
    body: document.body.innerText.slice(0, 400),
  }));

  await browser.close();
  server.close();
  return { perfOn, ...info, errors: errors.slice(0, 3) };
}

for (const perf of [false, true]) {
  const r = await runTest(perf);
  console.log(JSON.stringify(r, null, 2));
}
