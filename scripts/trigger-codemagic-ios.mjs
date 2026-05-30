/**
 * يشغّل بناء iOS على Codemagic (يتطلب API token).
 *
 *   CODEMAGIC_API_TOKEN=xxx npm run ios:codemagic
 *   CODEMAGIC_WORKFLOW=retweet-ios-ota-signed npm run ios:codemagic
 *
 * Token: Codemagic → User settings → Integrations → Codemagic API → Show
 * App ID (اختياري): CODEMAGIC_APP_ID — وإلا يُختار أول تطبيق يطابق Reyweet/retweet
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadDotEnv() {
  for (const name of [".env.local", ".env"]) {
    const p = path.join(root, name);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i < 1) continue;
      const k = t.slice(0, i).trim();
      let v = t.slice(i + 1).trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      if (!(k in process.env)) process.env[k] = v;
    }
  }
}

loadDotEnv();

const token =
  process.env.CODEMAGIC_API_TOKEN?.trim() ||
  process.env.CM_API_TOKEN?.trim() ||
  "";
const workflowId =
  process.env.CODEMAGIC_WORKFLOW?.trim() || "retweet-ios-ota-signed";
const branch = process.env.CODEMAGIC_BRANCH?.trim() || "main";
let appId = process.env.CODEMAGIC_APP_ID?.trim() || "";

if (!token) {
  console.error(
    "trigger-codemagic-ios: عيّن CODEMAGIC_API_TOKEN (Codemagic → User settings → API token)",
  );
  process.exit(1);
}

async function cmFetch(pathname, init = {}) {
  const res = await fetch(`https://api.codemagic.io${pathname}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-auth-token": token,
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  if (!res.ok) {
    const msg =
      body?.error?.message ||
      body?.message ||
      body?.detail ||
      text ||
      res.statusText;
    throw new Error(`Codemagic ${res.status}: ${msg}`);
  }
  return body;
}

async function resolveAppId() {
  if (appId) return appId;
  const data = await cmFetch("/apps");
  const apps = data?.applications ?? data?.apps ?? data ?? [];
  const list = Array.isArray(apps) ? apps : [];
  const match = list.find(a => {
    const name = String(a?.appName ?? a?.name ?? "").toLowerCase();
    const repo = String(a?.repository?.url ?? a?.repoUrl ?? "").toLowerCase();
    return (
      name.includes("reyweet") ||
      name.includes("retweet") ||
      repo.includes("reyweet") ||
      repo.includes("retweet")
    );
  });
  const picked = match ?? list[0];
  if (!picked?._id && !picked?.id) {
    throw new Error(
      "لم يُعثر على تطبيق Codemagic — عيّن CODEMAGIC_APP_ID يدوياً",
    );
  }
  appId = picked._id || picked.id;
  console.log(`  ✓ تطبيق: ${picked.appName ?? picked.name ?? appId}`);
  return appId;
}

async function main() {
  console.log("\n══ Codemagic — تشغيل بناء iOS ══\n");
  console.log(`  workflow: ${workflowId}`);
  console.log(`  branch:   ${branch}\n`);

  await resolveAppId();

  const payload = { appId, workflowId, branch };
  const started = await cmFetch("/builds", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  const buildId =
    started?.buildId ?? started?._id ?? started?.id ?? started?.build?._id;
  const url =
    started?.buildUrl ??
    (buildId ? `https://codemagic.io/app/${appId}/build/${buildId}` : null);

  console.log("  ✓ بدأ البناء على Codemagic");
  if (buildId) console.log(`  build id: ${buildId}`);
  if (url) console.log(`  رابط: ${url}`);
  console.log(
    "\nبعد النجاح: حمّل Reyweet-signed.ipa من Artifacts ثم:\n" +
      "  $env:COPY_IPA_PATH=\"C:\\path\\to\\Reyweet-signed.ipa\"\n" +
      "  $env:IOS_IPA_SIGNED=\"1\"\n" +
      "  npm run ios:ota-ready\n",
  );
}

main().catch(err => {
  console.error(`\n✗ ${err.message || err}\n`);
  process.exit(1);
});
