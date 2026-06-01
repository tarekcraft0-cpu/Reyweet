# Production Performance Benchmark

_2026-06-01T15:14:14.588Z_

**Build:** SPA production | **Duration:** 0.25 min | **Viewport:** iPhone 390×844

## Measurements

| Metric | Value |
|--------|-------|
| **Home Feed avg FPS** | **59.3** |
| **Worst FPS (fast scroll)** | **59** |
| **Memory start** | 5.6 MB |
| **Memory after 0.25 min** | **6 MB** |
| **Memory growth** | 0.4 MB |
| **JS blocking >16ms** | **1** events (worst 57ms) |
| **Network req/min** | **14.6** (15 API) |

## Top render counts

| Component | Renders |
|-----------|---------|
| PostCard | 139 |
| VirtualizedHomeFeed | 75 |
| HomeScreen | 3 |
| StoriesRow | 2 |
| App | 1 |

## FPS detail

- Idle: avg 59.3, min 57, p95-low 57
- Scroll: avg 59.5, min 59, max 60

Raw JSON: `docs/production-benchmark.json`
