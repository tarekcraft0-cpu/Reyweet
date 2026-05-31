#!/usr/bin/env node
/**
 * Production browser benchmark — Puppeteer + production SPA build.
 * Usage: node scripts/benchmark-production-browser.mjs
 * Env: BENCH_PORT, BENCH_DURATION_MS (default 600000 = 10min), BENCH_SCROLL_MS
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const PORT = Number(process.env.BENCH_PORT || 5199);
const DURATION_MS = Number(process.env.BENCH_DURATION_MS || 600_000);
const SCROLL_MS = Number(process.env.BENCH_SCROLL_MS || 45_000);
const BASE = `http://127.0.0.1:${PORT}/app/`;
const OUT_JSON = path.join(root, "docs", "production-benchmark.json");
const OUT_MD = path.join(root, "docs", "PRODUCTION_BENCHMARK.md");

const BENCH_USER_ID = "bench_user_local";

function makeSeedState(postCount = 120) {
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
    following: ["author_0", "author_1", "author_2", "author_3", "author_4"],
    highlights: [],
    blocked: [],
    closeFriends: [],
    favorites: [],
    followRequestIn: [],
    followRequestOut: [],
  };
  const authors = [0, 1, 2, 3, 4].map(i => ({
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
    userId: `author_${i % 5}`,
    type: "post",
    text: `Benchmark post #${i} — lorem ipsum feed content for scroll testing.`,
    likes: i % 7 === 0 ? [BENCH_USER_ID] : [],
    reposts: [],
    comments: [],
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

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function mime(p) {
  if (p.endsWith(".js") || p.endsWith(".mjs")) return "application/javascript; charset=utf-8";
  if (p.endsWith(".css")) return "text/css; charset=utf-8";
  if (p.endsWith(".html")) return "text/html; charset=utf-8";
  if (p.endsWith(".png")) return "image/png";
  if (p.endsWith(".webp")) return "image/webp";
  if (p.endsWith(".json")) return "application/json";
  if (p.endsWith(".webmanifest")) return "application/manifest+json";
  if (p.endsWith(".svg")) return "image/svg+xml";
  if (p.endsWith(".woff2")) return "font/woff2";
  return "application/octet-stream";
}

function startStaticServer(dir) {
  const server = http.createServer((req, res) => {
    let urlPath = decodeURIComponent(req.url?.split("?")[0] || "/");
    if (urlPath === "/health" || urlPath === "/app/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end('{"ok":true}');
      return;
    }
    if (urlPath.startsWith("/v1/") || urlPath.startsWith("/app/v1/") || urlPath.startsWith("/auth/")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end("{}");
      return;
    }
    if (urlPath === "/" || urlPath === "/app" || urlPath === "/app/") urlPath = "/index.html";
    if (urlPath.startsWith("/app/")) urlPath = urlPath.slice("/app".length) || "/index.html";
    const filePath = path.join(dir, urlPath === "/" ? "index.html" : urlPath);
    if (!filePath.startsWith(dir)) {
      res.writeHead(403);
      res.end();
      return;
    }
    fs.readFile(filePath, (err, data) => {
      if (err) {
        if (urlPath !== "/index.html") {
          fs.readFile(path.join(dir, "index.html"), (e2, d2) => {
            if (e2) {
              res.writeHead(404);
              res.end("404");
              return;
            }
            res.writeHead(200, { "Content-Type": "text/html" });
            res.end(d2);
          });
          return;
        }
        res.writeHead(404);
        res.end("404");
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

function injectBenchScript(seedState) {
  return `
    window.__BENCH__ = {
      fpsSamples: [],
      scrollFpsSamples: [],
      longTasksOver16: [],
      memoryMb: [],
      phase: 'idle',
    };
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith('retweet_')) localStorage.removeItem(k);
    }
    localStorage.setItem('retweet_perf', '1');
    localStorage.setItem('retweet_state_v2', ${JSON.stringify(JSON.stringify(seedState))});
    localStorage.setItem('retweet_web_api_config', JSON.stringify({ apiUrl: 'http://127.0.0.1:${PORT}', ts: Date.now() }));

    (function() {
      let last = performance.now();
      let frames = 0;
      function tick(now) {
        const bucket = window.__BENCH__.phase === 'scroll' ? window.__BENCH__.scrollFpsSamples : window.__BENCH__.fpsSamples;
        const delta = now - last;
        if (delta >= 1000) {
          bucket.push({ fps: frames, ts: now });
          frames = 0;
          last = now;
          const mem = performance.memory;
          if (mem) window.__BENCH__.memoryMb.push({ mb: mem.usedJSHeapSize / 1048576, ts: now, phase: window.__BENCH__.phase });
        } else {
          frames++;
        }
        requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
      try {
        new PerformanceObserver(function(list) {
          for (var e of list.getEntries()) {
            if (e.duration > 16) {
              window.__BENCH__.longTasksOver16.push({ ms: +e.duration.toFixed(2), name: e.name || '', ts: performance.now(), phase: window.__BENCH__.phase });
            }
          }
        }).observe({ entryTypes: ['longtask'] });
      } catch (e) {}
    })();
  `;
}

async function fastScroll(page, ms) {
  await page.evaluate(() => {
    window.__BENCH__.phase = "scroll";
  });
  const start = Date.now();
  while (Date.now() - start < ms) {
    await page.evaluate(() => {
      const panels = document.querySelectorAll('[class*="overflow-y-auto"], [class*="overflow-auto"]');
      let el = null;
      for (const p of panels) {
        if (p.scrollHeight > p.clientHeight + 100) {
          el = p;
          break;
        }
      }
      if (!el) el = document.scrollingElement || document.documentElement;
      el.scrollTop = (el.scrollTop || 0) + 900;
    });
    await sleep(16);
  }
  await page.evaluate(() => {
    window.__BENCH__.phase = "idle";
  });
}

function stats(arr, key) {
  if (!arr.length) return { avg: 0, min: 0, max: 0, p95: 0 };
  const vals = arr.map(x => x[key]).sort((a, b) => a - b);
  const sum = vals.reduce((a, b) => a + b, 0);
  return {
    avg: +(sum / vals.length).toFixed(1),
    min: vals[0],
    max: vals[vals.length - 1],
    p95: vals[Math.floor(vals.length * 0.05)] ?? vals[0],
  };
}

async function main() {
  console.info("[bench] Installing puppeteer if needed…");
  const puppeteer = await import("puppeteer").then(m => m.default).catch(async () => {
    console.info("[bench] Running npx puppeteer…");
    await new Promise((resolve, reject) => {
      const p = spawn("npm", ["install", "--no-save", "puppeteer@24"], { cwd: root, stdio: "inherit", shell: true });
      p.on("exit", c => (c === 0 ? resolve() : reject(new Error("puppeteer install failed"))));
    });
    return (await import("puppeteer")).default;
  });

  const spaDist = path.join(root, "spa-dist");
  if (!fs.existsSync(path.join(spaDist, "index.html"))) {
    console.info("[bench] Building SPA production…");
    await new Promise((resolve, reject) => {
      const p = spawn("npm", ["run", "build:spa"], { cwd: root, stdio: "inherit", shell: true });
      p.on("exit", c => (c === 0 ? resolve() : reject(new Error("build:spa failed"))));
    });
  }

  const server = await startStaticServer(spaDist);
  console.info(`[bench] Server http://127.0.0.1:${PORT}/app/`);

  const networkLog = [];
  const seedState = makeSeedState(120);
  const sessionStart = Date.now();

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
    await page.evaluateOnNewDocument(injectBenchScript(seedState));

    await page.setRequestInterception(true);
    page.on("request", req => {
      const u = req.url();
      if (!u.startsWith("data:") && !u.startsWith("blob:")) {
        networkLog.push({ ts: Date.now(), url: u, type: req.resourceType() });
      }
      if (u.startsWith("data:") || u.startsWith("blob:")) {
        req.continue();
        return;
      }
      if (u.startsWith(`http://127.0.0.1:${PORT}`) || u.startsWith(`http://localhost:${PORT}`)) {
        req.continue();
        return;
      }
      if (u.includes("/health") || u.includes("/v1/") || u.includes("/auth/")) {
        req.respond({ status: 200, contentType: "application/json", body: '{"ok":true}' });
        return;
      }
      req.abort("blockedbyclient");
    });

    console.info("[bench] Loading app…");
    await page.goto(BASE, { waitUntil: "networkidle2", timeout: 120_000 });

    let feedLoaded = false;
    try {
      await page.waitForFunction(
        () => document.querySelectorAll(".feed-post-card").length >= 3,
        { timeout: 90_000, polling: 500 },
      );
      feedLoaded = true;
    } catch {
      console.warn("[bench] Feed did not load — continuing with partial metrics");
    }

    const feedInfo = await page.evaluate(() => ({
      posts: document.querySelectorAll(".feed-post-card").length,
      crashed: !!document.body.innerText.includes("حدث خطأ في الواجهة"),
      bodySnippet: document.body.innerText.slice(0, 300),
    }));
    console.info("[bench] Feed status:", JSON.stringify(feedInfo));

    if (!feedLoaded && feedInfo.posts < 1) {
      console.warn("[bench] WARNING: Home feed not interactive — FPS/render metrics may not reflect real feed scroll");
    }

    console.info(`[bench] Idle phase 15s…`);
    await sleep(15_000);

    console.info(`[bench] Fast scroll ${SCROLL_MS / 1000}s…`);
    await fastScroll(page, SCROLL_MS);

    const scrollEnd = Date.now();
    const elapsedBeforeSoak = scrollEnd - sessionStart;
    const soakMs = Math.max(0, DURATION_MS - elapsedBeforeSoak);
    console.info(`[bench] Soak ${Math.round(soakMs / 1000)}s (total ~${DURATION_MS / 1000}s)…`);

    const soakStart = Date.now();
    while (Date.now() - soakStart < soakMs) {
      await page.evaluate(() => {
        const mem = performance.memory;
        if (mem) {
          window.__BENCH__.memoryMb.push({
            mb: mem.usedJSHeapSize / 1048576,
            ts: performance.now(),
            phase: "soak",
          });
        }
      });
      await sleep(10_000);
    }

    const bench = await page.evaluate(() => window.__BENCH__);
    const renderCounts = await page.evaluate(() =>
      typeof window.__retweetGetRenderCounts === "function" ? window.__retweetGetRenderCounts() : [],
    );
    const slowRenders = await page.evaluate(() =>
      typeof window.__retweetGetSlowRenders === "function" ? window.__retweetGetSlowRenders() : [],
    );
    const metrics = await page.metrics();

    const totalMin = (Date.now() - sessionStart) / 60_000;
    const apiRequests = networkLog.filter(r => r.type === "fetch" || r.type === "xhr" || r.url.includes("/v1/"));
    const reqPerMin = +(apiRequests.length / Math.max(totalMin, 0.1)).toFixed(1);

    const idleFps = stats(bench.fpsSamples.filter(s => !bench.scrollFpsSamples.includes(s)), "fps");
    const scrollFps = stats(bench.scrollFpsSamples, "fps");
    const memAll = bench.memoryMb.map(m => m.mb);
    const memStart = memAll[0] ?? metrics.JSHeapUsedSize / 1048576;
    const memEnd = memAll[memAll.length - 1] ?? metrics.JSHeapUsedSize / 1048576;

    const longTasks16 = bench.longTasksOver16.filter(t => t.ms > 16);
    const topRenders = [...renderCounts].sort((a, b) => b[1] - a[1]).slice(0, 15);

    const report = {
      generatedAt: new Date().toISOString(),
      environment: {
        build: "spa-dist production (vite build:spa)",
        url: BASE,
        viewport: "390x844 @2x",
        durationMs: DURATION_MS,
        scrollPhaseMs: SCROLL_MS,
        feedPostsVisible: feedInfo.posts,
        feedLoaded,
        uiCrashed: feedInfo.crashed,
      },
      measurements: {
        homeFeedAvgFps: idleFps.avg,
        homeFeedFpsStats: idleFps,
        fastScrollWorstFps: scrollFps.min,
        fastScrollFpsStats: scrollFps,
        memoryStartMb: +memStart.toFixed(1),
        memoryAfter10MinMb: +memEnd.toFixed(1),
        memoryGrowthMb: +(memEnd - memStart).toFixed(1),
        jsBlockingEventsOver16ms: longTasks16.length,
        jsBlockingWorstMs: longTasks16.length ? Math.max(...longTasks16.map(t => t.ms)) : 0,
        jsBlockingAvgMs: longTasks16.length
          ? +(longTasks16.reduce((a, t) => a + t.ms, 0) / longTasks16.length).toFixed(1)
          : 0,
        topRenderCounts: topRenders.map(([name, count]) => ({ component: name, renders: count })),
        networkRequestsTotal: networkLog.length,
        networkApiRequests: apiRequests.length,
        networkRequestsPerMinute: reqPerMin,
        slowRenderEvents: slowRenders.slice(0, 10),
      },
      raw: {
        fpsIdleSamples: bench.fpsSamples.length,
        fpsScrollSamples: bench.scrollFpsSamples.length,
        memorySamples: bench.memoryMb.length,
        longTaskSample: longTasks16.slice(0, 20),
      },
    };

    fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
    fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));

    const md = `# Production Performance Benchmark

_${report.generatedAt}_

**Build:** SPA production | **Duration:** ${DURATION_MS / 60000} min | **Viewport:** iPhone 390×844

## Measurements

| Metric | Value |
|--------|-------|
| **Home Feed avg FPS** | **${report.measurements.homeFeedAvgFps}** |
| **Worst FPS (fast scroll)** | **${report.measurements.fastScrollWorstFps}** |
| **Memory start** | ${report.measurements.memoryStartMb} MB |
| **Memory after ${DURATION_MS / 60000} min** | **${report.measurements.memoryAfter10MinMb} MB** |
| **Memory growth** | ${report.measurements.memoryGrowthMb} MB |
| **JS blocking >16ms** | **${report.measurements.jsBlockingEventsOver16ms}** events (worst ${report.measurements.jsBlockingWorstMs}ms) |
| **Network req/min** | **${report.measurements.networkRequestsPerMinute}** (${report.measurements.networkApiRequests} API) |

## Top render counts

| Component | Renders |
|-----------|---------|
${topRenders.map(([n, c]) => `| ${n} | ${c} |`).join("\n") || "| — | — |"}

## FPS detail

- Idle: avg ${idleFps.avg}, min ${idleFps.min}, p95-low ${idleFps.p95}
- Scroll: avg ${scrollFps.avg}, min ${scrollFps.min}, max ${scrollFps.max}

Raw JSON: \`docs/production-benchmark.json\`
`;

    fs.writeFileSync(OUT_MD, md);
    console.info("\n" + md);
    console.info(`\nWrote ${OUT_JSON}`);
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch(err => {
  console.error("[bench] FAILED:", err);
  process.exit(1);
});
