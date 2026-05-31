# Production Performance Benchmark

_2026-05-31T01:57:14.158Z_

**Build:** SPA production (`npm run build:spa`) | **Duration:** 10 min | **Viewport:** iPhone 390×844 @2x  
**Harness:** Puppeteer headless Chrome + local static server (`scripts/benchmark-production-browser.mjs`)

## Validity

**This run is partially invalid for Home Feed performance.** The app logged in with seeded local user `bench_user_local`, then hit **React error #185** (maximum update depth) within ~1s. The error boundary replaced the feed with a static crash screen. **0 feed post cards** were rendered; scroll/FPS mostly measured the crash UI + PerfHUD, not a scrolling feed.

Re-run after fixing the #185 render loop (HomeScreen/StoriesRow mount storm).

## Measurements (as captured)

| Metric | Value | Notes |
|--------|-------|-------|
| **Home Feed avg FPS** | **59.5** | Headless RAF on crash screen — not real feed |
| **Worst FPS (fast scroll)** | **59** | No feed cards to scroll |
| **Memory start** | 6.4 MB | Pre-crash heap |
| **Memory after 10 min** | **5.6 MB** | Crash UI only (~6 MB, not 30–80 MB expected for feed) |
| **Memory growth** | −0.7 MB | |
| **JS blocking >16ms** | **1** event (worst **76 ms**) | Single long task at crash |
| **Network req/min** | **4.3** (43 API-ish) | Mocked `/health` + blocked external |

## Top render counts (pre-crash, ~1s window)

| Component | Renders |
|-----------|---------|
| HomeScreen | 53 |
| StoriesRow | 53 |
| VirtualizedHomeFeed | 2 |
| App | 1 |

Slow renders before crash: App 40ms, HomeScreen 33ms, StoriesRow 32ms, VirtualizedHomeFeed 31ms.

## FPS detail

- Idle: avg 59.5, min 55, p95-low 59
- Scroll: avg 59.6, min 59, max 60

## Fixes applied during benchmark investigation

- `useAppSelector`: stable `isEqual` via ref (prevents resubscribe loops)
- `StoriesRow`: stable `equalTrayUsers` + ref-based selectors
- `VirtualizedHomeFeed`: load-more effect uses `lastVisibleIndex` not `virtualItems` ref
- `store.tsx`: `homeFeedSig` / effect deps use user id not object identity
- Benchmark: API health mock, MIME types, bench user seed, request blocking

Raw JSON: `docs/production-benchmark.json`

**Re-run:** `npm run build:spa && npm run bench:prod` (set `BENCH_DURATION_MS=600000` for 10 min)
