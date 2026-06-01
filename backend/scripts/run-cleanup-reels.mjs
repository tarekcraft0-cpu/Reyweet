#!/usr/bin/env node
import { cleanupStaleReels } from "../src/lib/seedDemoContent.ts";

const n = await cleanupStaleReels();
console.log(`Removed ${n} stale/spam reel(s).`);
