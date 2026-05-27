import { initDatabase } from "../src/db/engine.js";
import { ensureDemoDatabaseContent } from "../src/lib/seedDemoContent.js";

const force = process.argv.includes("--force");

await initDatabase();
const result = await ensureDemoDatabaseContent(force);
console.log(
  force ? "[seed] forced" : "[seed] done",
  result.seeded ? "— content added/updated" : "— already sufficient",
  `posts=${result.posts}`,
);
