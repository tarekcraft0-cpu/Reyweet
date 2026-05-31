#!/usr/bin/env node
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const PORT = 5196;
const BENCH_USER_ID = "bench_user_local";

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

const peerId = "author_peer";
const chatId = `dm_${BENCH_USER_ID}_${peerId}`;
const seed = {
  currentUserId: BENCH_USER_ID,
  accountIds: [BENCH_USER_ID],
  users: [{
    id: BENCH_USER_ID, username: "bench", email: "b@t.l", password: "", bio: "", avatar: "👀",
    isPrivate: false, verified: false, followers: [], following: [peerId],
    highlights: [], blocked: [], closeFriends: [], favorites: [], followRequestIn: [], followRequestOut: [],
    pinnedChatIds: [],
  }, {
    id: peerId, username: "friend", email: "f@t.l", password: "", bio: "", avatar: "",
    isPrivate: false, verified: false, followers: [BENCH_USER_ID], following: [BENCH_USER_ID],
    highlights: [], blocked: [], closeFriends: [], favorites: [], followRequestIn: [], followRequestOut: [],
  }],
  posts: [],
  stories: [],
  chats: [{
    id: chatId,
    members: [BENCH_USER_ID, peerId],
    messages: [{ id: "m1", senderId: peerId, text: "مرحبا", createdAt: Date.now(), status: "sent" }],
    isGroup: false,
    isChannel: false,
    name: "",
    avatar: "",
  }],
  notifications: [], mediaNotes: [], stickers: [], theme: "light", language: "ar",
};

const server = await startServer(path.join(root, "spa-dist"));
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", e => errors.push(e.message));

await page.setRequestInterception(true);
page.on("request", req => {
  const u = req.url();
  if (u.startsWith("data:") || u.startsWith("blob:")) { req.continue(); return; }
  if (u.includes(`127.0.0.1:${PORT}`)) { req.continue(); return; }
  if (u.includes("/health") || u.includes("/v1/") || u.includes("/auth/")) {
    req.respond({ status: 200, contentType: "application/json", body: '{"ok":true}' });
    return;
  }
  req.abort("blockedbyclient");
});

await page.evaluateOnNewDocument(s => {
  for (const k of Object.keys(localStorage)) {
    if (k.startsWith("retweet_")) localStorage.removeItem(k);
  }
  localStorage.setItem("retweet_perf", "0");
  localStorage.setItem("retweet_api_token", "test_token");
  localStorage.setItem("retweet_state_v2", JSON.stringify(s));
  localStorage.setItem("retweet_web_api_config", JSON.stringify({ apiUrl: `http://127.0.0.1:${PORT}`, ts: Date.now() }));
}, seed);

await page.goto(`http://127.0.0.1:${PORT}/app/`, { waitUntil: "networkidle2", timeout: 30000 });
await new Promise(r => setTimeout(r, 1500));

// Go to chat tab (nav index 3)
await page.evaluate(() => {
  const btns = [...document.querySelectorAll("button")];
  const nav = btns.filter(b => b.closest("[class*='bottom']") || b.getAttribute("tabindex"));
  nav[3]?.click();
});
await new Promise(r => setTimeout(r, 1200));

// Click first chat row
await page.evaluate(() => {
  const rows = [...document.querySelectorAll("[data-chat-row], button")].filter(
    el => el.textContent?.includes("friend") || el.textContent?.includes("@friend"),
  );
  (rows[0] || document.querySelector("button"))?.click();
});
await new Promise(r => setTimeout(r, 2000));

const info = await page.evaluate(() => ({
  crashed: document.body.innerText.includes("حدث خطأ في الواجهة"),
  hasComposer: !!document.querySelector("textarea") || !!document.querySelector("[contenteditable]"),
  body: document.body.innerText.slice(0, 300),
}));

console.log(JSON.stringify({ ...info, errors: errors.slice(0, 5) }, null, 2));
await browser.close();
server.close();
process.exit(info.crashed || errors.some(e => e.includes("state is not defined")) ? 1 : 0);
