#!/usr/bin/env node
/** يحاكي Capacitor + تحميل فيد بعد تسجيل الدخول — يكتشف React #185 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.BENCH_PORT || 5201);
const BASE = `http://127.0.0.1:${PORT}/app/`;
const BENCH_USER_ID = "bench_user_native";

function makeSeedState(postCount = 35) {
  const me = {
    id: BENCH_USER_ID,
    username: "bench_user",
    email: "bench@test.local",
    password: "",
    bio: "",
    avatar: "",
    isPrivate: false,
    verified: false,
    followers: [],
    following: ["author_0", "author_1"],
    highlights: [],
    blocked: [],
    closeFriends: [],
    favorites: [],
    followRequestIn: [],
    followRequestOut: [],
  };
  const authors = [0, 1].map(i => ({
    id: `author_${i}`,
    username: `user${i}`,
    email: `u${i}@test.local`,
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
  const posts = Array.from({ length: postCount }, (_, i) => ({
    id: `bench_post_${i}`,
    userId: `author_${i % 2}`,
    type: "post",
    text: `Native bench post #${i} — enough text to render a card.`,
    likes: i % 5 === 0 ? [BENCH_USER_ID] : [],
    reposts: [],
    comments: i % 7 === 0 ? [{ id: `c${i}`, userId: BENCH_USER_ID, text: "hi", createdAt: Date.now() }] : [],
    createdAt: Date.now() - i * 60_000,
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

function makeFeedResponse(seed) {
  return {
    ok: true,
    posts: seed.posts,
    users: seed.users.filter(u => u.id !== BENCH_USER_ID),
    hasMore: false,
  };
}

function startStaticServer(dir, seed) {
  const feedJson = JSON.stringify(makeFeedResponse(seed));
  const server = http.createServer((req, res) => {
    let urlPath = decodeURIComponent(req.url?.split("?")[0] || "/");
    if (urlPath.includes("/v1/feed/posts")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(feedJson);
      return;
    }
    if (urlPath === "/health" || urlPath.startsWith("/v1/") || urlPath.startsWith("/auth/")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end("{}");
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
      const ext = path.extname(filePath);
      const type =
        ext === ".js"
          ? "application/javascript"
          : ext === ".css"
            ? "text/css"
            : "text/html";
      res.writeHead(200, { "Content-Type": type });
      res.end(data);
    });
  });
  return new Promise((resolve, reject) => {
    server.listen(PORT, "127.0.0.1", () => resolve(server));
    server.on("error", reject);
  });
}

const seed = makeSeedState(40);

const inject = `
window.__RETWEET_NATIVE_SHELL__ = true;
window.__RETWEET_NO_SELECT_BOOT__ = true;
document.documentElement.classList.add('retweet-native-shell');
for (const k of Object.keys(localStorage)) {
  if (k.startsWith('retweet_')) localStorage.removeItem(k);
}
localStorage.setItem('retweet_state_v2', ${JSON.stringify(JSON.stringify(seed))});
localStorage.setItem('retweet_web_api_config', JSON.stringify({ apiUrl: 'http://127.0.0.1:${PORT}', ts: Date.now() }));
localStorage.setItem('retweet_api_token', 'bench-token');
window.__RETWEET_API_URL__ = 'http://127.0.0.1:${PORT}';
`;

async function main() {
  const spaDist = path.join(root, "spa-dist");
  if (!fs.existsSync(path.join(spaDist, "index.html"))) {
    await new Promise((resolve, reject) => {
      const p = spawn("npm", ["run", "build:spa"], {
        cwd: root,
        stdio: "inherit",
        shell: true,
        env: { ...process.env, CAPACITOR_NATIVE: "1" },
      });
      p.on("exit", c => (c === 0 ? resolve() : reject(new Error("build failed"))));
    });
  }

  const server = await startStaticServer(spaDist, seed);
  const puppeteer = (await import("puppeteer")).default;
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
    await page.evaluateOnNewDocument(inject);

    await page.setRequestInterception(true);
    page.on("request", req => {
      const u = req.url();
      if (u.startsWith(`http://127.0.0.1:${PORT}`)) {
        req.continue();
        return;
      }
      if (u.includes("/health") || u.includes("/v1/") || u.includes("/auth/")) {
        req.respond({ status: 200, contentType: "application/json", body: "{}" });
        return;
      }
      req.abort();
    });

    await page.goto(BASE, { waitUntil: "networkidle2", timeout: 120_000 });

    await page.waitForFunction(
      () => {
        const t = document.body?.innerText || "";
        if (t.includes("حدث خطأ في الواجهة")) return true;
        if (t.includes("تعذر الاتصال بالخادم")) return true;
        return document.querySelectorAll(".feed-post-card").length >= 3;
      },
      { timeout: 60_000, polling: 200 },
    );

    for (let i = 0; i < 40; i++) {
      await page.evaluate(() => {
        window.dispatchEvent(new Event("resize"));
        window.visualViewport?.dispatchEvent(new Event("resize"));
        window.dispatchEvent(new Event("retweet-safe-area-change"));
        window.dispatchEvent(new Event("retweet-auth-feed-refresh"));
      });
      await new Promise(r => setTimeout(r, 20));
    }

    await new Promise(r => setTimeout(r, 4000));

    const result = await page.evaluate(() => ({
      crashed: document.body.innerText.includes("حدث خطأ في الواجهة"),
      react185: document.body.innerText.includes("Minified React error #185"),
      posts: document.querySelectorAll(".feed-post-card").length,
      simpleFeed: !document.querySelector("[data-index]"),
    }));

    console.log(JSON.stringify(result, null, 2));
    if (result.crashed || result.react185 || result.posts < 3) {
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
