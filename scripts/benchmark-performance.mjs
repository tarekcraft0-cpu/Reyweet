#!/usr/bin/env node
/**
 * قياس أداء تقريبي للواجهة والـ API — شغّل: node scripts/benchmark-performance.mjs
 * يُخرج JSON + ملخص في docs/PERFORMANCE_REPORT.md
 */
import { performance } from "node:perf_hooks";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function bench(name, fn, iterations = 50) {
  const times = [];
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    fn();
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  const p50 = times[Math.floor(times.length * 0.5)];
  const p95 = times[Math.floor(times.length * 0.95)];
  return { name, iterations, p50Ms: +p50.toFixed(3), p95Ms: +p95.toFixed(3) };
}

function makePosts(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    userId: `u${i % 200}`,
    type: "post",
    text: `post ${i}`,
    likes: [],
    reposts: [],
    comments: [],
    createdAt: Date.now() - i * 1000,
  }));
}

function makeChats(n, msgsPerChat) {
  return Array.from({ length: n }, (_, ci) => ({
    id: `c${ci}`,
    members: ["me", `u${ci}`],
    messages: Array.from({ length: msgsPerChat }, (_, mi) => ({
      id: `m${ci}_${mi}`,
      senderId: mi % 2 ? "me" : `u${ci}`,
      status: mi % 3 ? "read" : "delivered",
      type: "text",
      content: "hi",
      createdAt: Date.now() - mi,
    })),
  }));
}

const posts5k = makePosts(5000);
const chats200 = makeChats(200, 80);

const results = [
  bench("feed_filter_sort_5k_posts", () => {
    const seen = new Set();
    posts5k
      .filter(p => {
        if (seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  }),
  bench("unread_scan_200_chats_x80_msgs", () => {
    let count = 0;
    for (const chat of chats200) {
      for (const m of chat.messages) {
        if (m.senderId !== "me" && m.status !== "read") count++;
      }
    }
    return count;
  }),
  bench("json_stringify_app_state_5k_posts", () => {
    JSON.stringify({ posts: posts5k, users: [], chats: chats200.slice(0, 20) });
  }),
  bench("paginate_slice_30_from_5k", () => posts5k.slice(0, 30)),
];

const report = {
  generatedAt: new Date().toISOString(),
  note: "قبل التحسين: baseline محلي. بعد التحسين: قارن p50/p95 — pagination وcache يجب أن يخفّض feed_filter وjson_stringify.",
  results,
  recommendations: [
    "استخدم limit/cursor في /v1/feed/posts بدل تحميل آلاف المنشورات",
    "لا تُ serializ كل state — احفظ شرائح أو استخدم requestIdleCallback",
    "احسب unread incrementally بدل مسح كل المحادثات",
    "LazyInView + memo على قوائم البروفايل",
  ],
};

const outJson = path.join(root, "docs", "performance-benchmark.json");
const outMd = path.join(root, "docs", "PERFORMANCE_REPORT.md");
fs.mkdirSync(path.dirname(outJson), { recursive: true });
fs.writeFileSync(outJson, JSON.stringify(report, null, 2));

const md = `# تقرير أداء Retweet

_آخر قياس: ${report.generatedAt}_

| اختبار | p50 (ms) | p95 (ms) |
|--------|----------|----------|
${results.map(r => `| ${r.name} | ${r.p50Ms} | ${r.p95Ms} |`).join("\n")}

## التحسينات المطبّقة

1. **Pagination** — \`/v1/feed/posts\`, \`/v1/users/:id/posts\`, \`/v1/chats/:id/messages\` تدعم \`limit\` و \`before\`
2. **Client API cache** — \`src/lib/apiCache.ts\` (TTL للدليل والصفحة الأولى من الفيد)
3. **Retry logic** — إعادة محاولة تلقائية على 503/504 في \`apiFetch\`
4. **Backend collection cache** — \`backend/src/db/collectionCache.ts\` (4s TTL)
5. **Hydrate dedupe** — قراءة messages.json مرة واحدة في app-state
6. **Compact JSON writes** — بدون pretty-print في engine
7. **Home feed windowing** — عرض تدريجي + تحميل المزيد عند التمرير
8. **ProfileFeedItem** — \`memo\` + \`LazyInView\` للوسائط
9. **Polling consolidation** — إزالة interval 20s المكرر من HomeScreen
10. **Unread counter** — يُحسب في store (deps على chats فقط)

## إعادة القياس

\`\`\`bash
node scripts/benchmark-performance.mjs
\`\`\`
`;

fs.writeFileSync(outMd, md);
console.log(JSON.stringify(report, null, 2));
console.log("\nWrote", outMd);
