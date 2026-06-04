import path from "node:path";
import { fileURLToPath } from "node:url";
import { injectNativeShellIndex } from "./lib/inject-native-shell-index.mjs";
import { resolveMobileApiUrl } from "./lib/read-public-api-url.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const apiUrl = resolveMobileApiUrl();
for (const rel of [
  "dist/index.html",
  "spa-dist/index.html",
  "android/app/src/main/assets/public/index.html",
]) {
  injectNativeShellIndex(path.join(root, rel), apiUrl, root);
}
