#!/usr/bin/env node
/**
 * Reproduce chat-room crash — seeds a DM chat and opens it in production build.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const PORT = Number(process.env.REPRO_PORT || 5198);
const BASE = `http://127.0.0.1:${PORT}/app/`;
const BENCH_USER = "bench_user_local";
const PEER_USER = "peer_user_1";
const CHAT_ID = `dm_${BENCH_USER}_${PEER_USER}`;

function makeState() {
  const me = {
    id: BENCH_USER,
    username: "bench_user",
    email: "bench@test.local",
    password: "",
    bio: "",
    avatar: "",
    isPrivate: false,
    verified: false,
    followers: [PEER_USER],
    following: [PEER_USER],
    highlights: [],
    blocked: [],
    closeFriends: [],
    favorites: [],
    followRequestIn: [],
    followRequestOut: [],
    pinnedChatIds: [],
    mutedChatIds: [],
  };
  const peer = {
    id: PEER_USER,
    username: "peer1",
    email: "p@test.local",
    password: "",
    bio: "hi",
    avatar: "",
    isPrivate: false,
    verified: false,
    followers: [BENCH_USER],
    following: [BENCH_USER],
    highlights: [],
    blocked: [],
    closeFriends: [],
    favorites: [],
    followRequestIn: [],
    followRequestOut: [],
  };
  const messages = Array.from({ length: 40 }, (_, i) => ({
    id: `msg_${i}`,
    senderId: i % 2 === 0 ? PEER_USER : BENCH_USER,
    type: "text",
    content: i % 5 === 0 ? `Hello @peer1 #test ${i}` : `Message line ${i} with some text`,
    createdAt: Date.now() - (40 - i) * 60_000,
    status: "read",
  }));
  const chat = {
    id: CHAT_ID,
    members: [BENCH_USER, PEER_USER],
    messages,
    admins: [],
    lastOpenAtByUser: {},
    lastReadMessageIdByUser: {},
    pinnedMessageIds: [],
  };
  return {
    currentUserId: BENCH_USER,
    accountIds: [BENCH_USER],
    users: [me, peer],
    posts: [],
    stories: [],
    chats: [chat],
    notifications: [],
    mediaNotes: [],
    stickers: [],
    theme: "light",
    language: "ar",
  };
}

function mime(p) {
  if (p.endsWith(".js") || p.endsWith(".mjs")) return "application/javascript; charset=utf-8";
  if (p.endsWith(".css")) return "text/css; charset=utf-8";
  if (p.endsWith(".html")) return "text/html; charset=utf-8";
  if (p.endsWith(".json")) return "application/json";
  return "application/octet-stream";
}

function startServer(dir) {
  const server = http.createServer((req, res) => {
    let urlPath = decodeURIComponent(req.url?.split("?")[0] || "/");
    if (urlPath.startsWith("/v1/") || urlPath.startsWith("/app/v1/") || urlPath.startsWith("/auth/")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end('{"ok":true}');
      return;
    }
    if (urlPath === "/" || urlPath === "/app" || urlPath === "/app/") urlPath = "/index.html";
    if (urlPath.startsWith("/app/")) urlPath = urlPath.slice("/app".length) || "/index.html";
    const filePath = path.join(dir, urlPath === "/" ? "index.html" : urlPath);
    fs.readFile(filePath, (err, data) => {
      if (err) {
        fs.readFile(path.join(dir, "index.html"), (e2, d2) => {
          res.writeHead(e2 ? 404 : 200, { "Content-Type": "text/html" });
          res.end(e2 ? "404" : d2);
        });
        return;
      }
      res.writeHead(200, { "Content-Type": mime(filePath) });
      res.end(data);
    });
  });
  return new Promise((resolve, reject) => {
    server.listen(PORT, "127.0.0.1", () => resolve(server));
    server.on("error", reject);
  });
}

async function main() {
  const puppeteer = (await import("puppeteer")).default;
  const spaDist = path.join(root, "spa-dist");
  if (!fs.existsSync(path.join(spaDist, "index.html"))) {
    await new Promise((resolve, reject) => {
      const p = spawn("npm", ["run", "build:spa"], { cwd: root, stdio: "inherit", shell: true });
      p.on("exit", c => (c === 0 ? resolve() : reject(new Error("build failed"))));
    });
  }

  const server = await startServer(spaDist);
  const errors = [];
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
    page.on("pageerror", err => errors.push({ type: "pageerror", msg: String(err) }));
    page.on("console", msg => {
      if (msg.type() === "error") errors.push({ type: "console", msg: msg.text() });
    });

    const seed = JSON.stringify(makeState());
    await page.evaluateOnNewDocument(s => {
      for (const k of Object.keys(localStorage)) {
        if (k.startsWith("retweet_")) localStorage.removeItem(k);
      }
      localStorage.setItem("retweet_state_v2", s);
      localStorage.setItem("retweet_web_api_config", JSON.stringify({ apiUrl: `http://127.0.0.1:${PORT}`, ts: Date.now() }));
    }, seed);

    await page.goto(BASE, { waitUntil: "networkidle2", timeout: 60_000 });
    await page.waitForFunction(() => !document.body.innerText.includes("تسجيل الدخول"), { timeout: 30_000 }).catch(() => {});

    // Open chat tab
    const chatTab = await page.waitForSelector('[data-tab="chat"], nav button, [aria-label*="رسائل"], [aria-label*="chat"]', { timeout: 15_000 }).catch(() => null);
    if (!chatTab) {
      const tabs = await page.$$("nav button");
      if (tabs[3]) await tabs[3].click();
    } else await chatTab.click();

    await new Promise(r => setTimeout(r, 1500));

    // Click first chat row
    const row = await page.waitForSelector("[data-chat-row], [data-chat-list-row], .chat-inbox-row, button", { timeout: 10_000 }).catch(() => null);
    const clicked = await page.evaluate(() => {
      const el =
        document.querySelector("[data-chat-row]") ||
        document.querySelector("[data-chat-list-row]") ||
        document.querySelector(".chat-inbox-row");
      if (el) {
        (el instanceof HTMLElement ? el : el.parentElement)?.click?.();
        return "data-chat-row";
      }
      const buttons = [...document.querySelectorAll("button")];
      const hit = buttons.find(b => b.textContent?.includes("@peer1") || b.textContent?.includes("peer1"));
      if (hit) {
        hit.click();
        return "button-peer";
      }
      return null;
    });

    await new Promise(r => setTimeout(r, 2500));

    const status = await page.evaluate(() => ({
      crashed: document.body.innerText.includes("حدث خطأ في الواجهة"),
      label: document.body.innerText.match(/غرفة المحادثة|edit-profile|الرسائل/)?.[0] || "",
      hasRoom: !!document.querySelector("[data-chat-room]"),
      hasBoundary: document.body.innerText.includes("حدث خطأ"),
      snippet: document.body.innerText.slice(0, 500),
      errorDetail: (() => {
        const pre = document.querySelector("pre");
        return pre?.textContent?.slice(0, 800) || "";
      })(),
    }));

    console.log(JSON.stringify({ clicked, status, errors: errors.slice(0, 20) }, null, 2));
    process.exitCode = status.crashed ? 1 : 0;
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
