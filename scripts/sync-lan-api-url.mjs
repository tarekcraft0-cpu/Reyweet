/**
 * يكتشف IPv4 على الشبكة المحلية ويضبط روابط Retweet API في الويب والموبايل.
 * شغّل: npm run sync:api
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const API_PORT = Number(process.env.API_PORT || process.env.PORT || 3000);

function pickLanIPv4() {
  const nets = os.networkInterfaces();
  const candidates = [];
  for (const list of Object.values(nets)) {
    for (const ni of list ?? []) {
      const fam = ni.family;
      if ((fam !== "IPv4" && fam !== 4) || ni.internal) continue;
      if (ni.address.startsWith("169.254.")) continue;
      candidates.push(ni.address);
    }
  }
  return candidates.find(a => a.startsWith("192.168.")) || candidates[0] || "127.0.0.1";
}

const host = process.env.LAN_HOST?.trim() || pickLanIPv4();
const apiUrl = `http://${host}:${API_PORT}`;

function writeJson(p, data) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + "\n", "utf8");
  console.log(`  ✓ ${path.relative(root, p)}`);
}

function patchEnvFile(envPath) {
  /** الويب على :3080 يستخدم بروكسي Vite — لا نضبط VITE_API_URL حتى لا يكسر الاتصال */
  const lines = [`VITE_API_URL_MOBILE=${apiUrl}`, `LAN_API_URL=${apiUrl}`];
  if (!fs.existsSync(envPath)) {
    fs.writeFileSync(envPath, lines.join("\n") + "\n", "utf8");
    console.log(`  ✓ created ${path.relative(root, envPath)}`);
    return;
  }
  let text = fs.readFileSync(envPath, "utf8");
  const setLine = (key, value) => {
    const re = new RegExp(`^${key}=.*$`, "m");
    if (re.test(text)) text = text.replace(re, `${key}=${value}`);
    else text += `${text.endsWith("\n") ? "" : "\n"}${key}=${value}\n`;
  };
  const dropLine = key => {
    text = text.replace(new RegExp(`^${key}=.*\\n?`, "m"), "");
  };
  dropLine("VITE_API_URL");
  setLine("VITE_API_URL_MOBILE", apiUrl);
  setLine("LAN_API_URL", apiUrl);
  fs.writeFileSync(envPath, text, "utf8");
  console.log(`  ✓ ${path.relative(root, envPath)}`);
}

console.log(`\nRetweet API → ${apiUrl}\n`);

patchEnvFile(path.join(root, ".env"));
writeJson(path.join(root, "spa/public/web-auth-config.json"), {
  apiUrl: "",
  supabaseUrl: "",
  supabaseAnonKey: "",
});
const appConfigPath = path.join(root, "landing/public/app-config.json");
let appConfig = {
  apiUrl: "",
  appPath: "/app/",
  siteUrl: `http://${host}:3080`,
  supabaseUrl: "",
  supabaseAnonKey: "",
};
if (fs.existsSync(appConfigPath)) {
  try {
    appConfig = { ...appConfig, ...JSON.parse(fs.readFileSync(appConfigPath, "utf8")) };
  } catch {
    /* ignore */
  }
}
writeJson(appConfigPath, { ...appConfig, apiUrl: "", siteUrl: `http://${host}:3080` });

console.log(`
التالي:
  1) npm run backend:dev     (يستمع على 0.0.0.0:${API_PORT})
  2) للويب محلياً: npx vite dev --config vite.spa.config.ts --host 0.0.0.0 --port 3080
     ثم افتح: http://${host}:3080/app/
  3) للموبايل: npm run dev:lan  (منفذ 3077) أو Expo مع نفس الشبكة
  4) موقع Vercel من الإنترنت يحتاج نفقاً: npm run tunnel:api  ثم RETWEET_PUBLIC_API_URL
`);
