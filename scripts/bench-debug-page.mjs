#!/usr/bin/env node
/** Quick load probe — reuses benchmark static server. */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const PORT = 5199;
const BASE = `http://127.0.0.1:${PORT}/app/`;
const BENCH_USER_ID = "bench_user_local";

function mime(p) {
  if (p.endsWith(".js") || p.endsWith(".mjs")) return "application/javascript; charset=utf-8";
  if (p.endsWith(".css")) return "text/css; charset=utf-8";
  if (p.endsWith(".html")) return "text/html; charset=utf-8";
  if (p.endsWith(".png")) return "image/png";
  if (p.endsWith(".json")) return "application/json";
  return "application/octet-stream";
}

function makeSeedState() {
  const me = {
    id: BENCH_USER_ID,
    username: "bench_user",
    email: "bench@test.local",
    password: "",
    bio: "",
    avatar: "👀",
    isPrivate: false,
    verified: false,
    followers: [],
    following: ["author_0", "author_1", "author_2"],
    highlights: [],
    blocked: [],
    closeFriends: [],
    favorites: [],
    followRequestIn: [],
    followRequestOut: [],
  };
  const authors = [0, 1, 2].map(i => ({
    id: `author_${i}`,
    username: `user${i}`,
    email: "",
    password: "",
    bio: "",
    avatar: "",
    isPrivate: false,
    verified: false,
    followers: [BENCH_USER_ID],
    following: [],
    highlights: [],
    blocked: [],
    closeFriends: [],
    favorites: [],
    followRequestIn: [],
    followRequestOut: [],
  }));
  const posts = Array.from({ length: 30 }, (_, i) => ({
    id: `bench_post_${i}`,
    userId: `author_${i % 3}`,
    type: "post",
    text: `Post ${i}`,
    likes: [],
    reposts: [],
    comments: [],
    createdAt: Date.now() - i * 60000,
  }));
  return {
    currentUserId: BENCH_USER_ID,
    accountIds: [BENCH_USER_ID],
    users: [me, ...authors],
    posts,
    stories: [],
    chats: [],
    notifications: [],
    mediaNotes: [],
    stickers: [],
    theme: "light",
    language: "ar",
  };
}

function startServer(dir) {
  return new Promise(resolve => {
    const s = http.createServer((req, res) => {
      let urlPath = decodeURIComponent(req.url?.split("?")[0] || "/");
      if (urlPath === "/health" || urlPath.startsWith("/v1/") || urlPath.startsWith("/auth/")) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end('{"ok":true}');
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

const seed = makeSeedState();
const inject = `
  for (const k of Object.keys(localStorage)) {
    if (k.startsWith('retweet_')) localStorage.removeItem(k);
  }
  localStorage.setItem('retweet_perf','1');
  localStorage.setItem('retweet_state_v2', ${JSON.stringify(JSON.stringify(seed))});
  localStorage.setItem('retweet_web_api_config', JSON.stringify({ apiUrl: 'http://127.0.0.1:${PORT}', ts: Date.now() }));
`;

const server = await startServer(path.join(root, "spa-dist"));
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
const consoleLogs = [];
page.on("console", msg => consoleLogs.push(`${msg.type()}: ${msg.text()}`));
page.on("pageerror", err => consoleLogs.push(`PAGEERROR: ${err.message}`));
await page.setViewport({ width: 390, height: 844 });
await page.evaluateOnNewDocument(inject);
await page.goto(BASE, { waitUntil: "networkidle2", timeout: 60000 });
await new Promise(r => setTimeout(r, 12000));
const info = await page.evaluate(() => ({
  body: document.body.innerText.slice(0, 800),
  feedCards: document.querySelectorAll(".feed-post-card").length,
  rootLen: document.getElementById("root")?.innerHTML?.length ?? 0,
  storedUserId: (() => { try { return JSON.parse(localStorage.getItem('retweet_state_v2')||'{}').currentUserId; } catch { return null; } })(),
}));
console.log(JSON.stringify(info, null, 2));
console.log("--- console ---");
consoleLogs.slice(-25).forEach(l => console.log(l));
await browser.close();
server.close();
