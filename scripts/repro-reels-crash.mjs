#!/usr/bin/env node
/** Reproduce Reels tab crash against spa-dist */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.REPRO_PORT || 5198);
const BENCH_USER_ID = "bench_user_local";

const reelsFeed = {
  reels: [
    {
      id: "reel_1",
      userId: "a1",
      videoUrl: "http://127.0.0.1:5198/uploads/reels/demo.mp4",
      thumbnailUrl: "",
      caption: "ريل تجريبي",
      likesCount: 2,
      commentsCount: 1,
      viewsCount: 10,
      likedByMe: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      postId: "reel_1",
    },
  ],
  users: [
    {
      id: "a1",
      username: "author",
      avatar: "AU",
      bio: "",
      verified: false,
      isPrivate: false,
    },
  ],
  hasMore: false,
};

const seed = {
  currentUserId: BENCH_USER_ID,
  accountIds: [BENCH_USER_ID],
  users: [
    {
      id: BENCH_USER_ID,
      username: "bench",
      email: "b@t.l",
      password: "",
      bio: "",
      avatar: "👀",
      isPrivate: false,
      verified: false,
      followers: [],
      following: ["a1"],
      highlights: [],
      blocked: [],
      closeFriends: [],
      favorites: [],
      followRequestIn: [],
      followRequestOut: [],
    },
    {
      id: "a1",
      username: "author",
      email: "a@t.l",
      password: "",
      bio: "",
      avatar: "AU",
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
    },
  ],
  posts: [],
  stories: [],
  chats: [],
  notifications: [],
  mediaNotes: [],
  stickers: [],
  theme: "light",
  language: "ar",
};

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
      if (urlPath === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end('{"ok":true}');
        return;
      }
      if (urlPath.startsWith("/v1/reels")) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(reelsFeed));
        return;
      }
      if (urlPath === "/v1/me/saved") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ savedPostIds: [] }));
        return;
      }
      if (urlPath.startsWith("/v1/")) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end('{"ok":true}');
        return;
      }
      if (urlPath === "/" || urlPath === "/app" || urlPath === "/app/") urlPath = "/index.html";
      if (urlPath.startsWith("/app/")) urlPath = urlPath.slice(4) || "/index.html";
      const fp = path.join(dir, urlPath === "/" ? "index.html" : urlPath);
      fs.readFile(fp, (e, d) => {
        if (e) {
          res.writeHead(404);
          res.end("404");
          return;
        }
        res.writeHead(200, { "Content-Type": mime(fp) });
        res.end(d);
      });
    });
    s.listen(PORT, "127.0.0.1", () => resolve(s));
  });
}

const server = await startServer(path.join(root, "spa-dist"));
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", e => errors.push(e.message));

await page.setRequestInterception(true);
page.on("request", req => {
  const u = req.url();
  if (u.startsWith("data:") || u.startsWith("blob:")) {
    req.continue();
    return;
  }
  if (u.includes(`127.0.0.1:${PORT}`)) {
    req.continue();
    return;
  }
  req.abort("blockedbyclient");
});

await page.evaluateOnNewDocument(s => {
  for (const k of Object.keys(localStorage)) {
    if (k.startsWith("retweet_")) localStorage.removeItem(k);
  }
  localStorage.setItem("retweet_api_token", "test_token");
  localStorage.setItem("retweet_state_v2", JSON.stringify(s));
  localStorage.setItem(
    "retweet_web_api_config",
    JSON.stringify({ apiUrl: `http://127.0.0.1:${PORT}`, ts: Date.now() }),
  );
}, seed);

await page.goto(`http://127.0.0.1:${PORT}/app/`, { waitUntil: "networkidle2", timeout: 45000 });
await new Promise(r => setTimeout(r, 2500));

const clicked = await page.evaluate(() => {
  const labels = ["ريلز", "Reels", "reels"];
  for (const t of labels) {
    const btn = [...document.querySelectorAll("button, a, [role='tab']")].find(
      el => (el.textContent || "").trim().includes(t) || el.getAttribute("aria-label")?.includes(t),
    );
    if (btn) {
      btn.click();
      return t;
    }
  }
  const nav = document.querySelectorAll("nav button, footer button, [class*='bottom'] button");
  if (nav.length >= 3) {
    nav[2]?.click();
    return "nav-index-2";
  }
  return null;
});

await new Promise(r => setTimeout(r, 2000));

const info = await page.evaluate(() => ({
  clicked,
  crashed: document.body.innerText.includes("حدث خطأ"),
  pre: document.querySelector("pre")?.innerText?.slice(0, 1200) ?? "",
  reelSlides: document.querySelectorAll("[data-reel-slide]").length,
  body: document.body.innerText.slice(0, 500),
}));

await browser.close();
server.close();

console.log(JSON.stringify({ ...info, pageErrors: errors }, null, 2));
process.exit(info.crashed || errors.length ? 1 : 0);
