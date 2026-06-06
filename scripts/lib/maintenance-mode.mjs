/**
 * تبديل vercel.json بين وضع الإنتاج (بروكسي → VPS) ووضع الصيانة (offline API).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const stateDir = path.join(root, ".stack-state");
const vercelPath = path.join(root, "vercel.json");
const backupPath = path.join(stateDir, "vercel.json.live");
const pausedFlag = path.join(stateDir, "paused.json");

export const OFFLINE = "/api/offline";

export function maintenanceRewrites() {
  return [
    { source: "/health", destination: OFFLINE },
    { source: "/auth/rt-ws/", destination: OFFLINE },
    { source: "/auth/rt-ws/:rest*", destination: OFFLINE },
    { source: "/auth/:path*", destination: OFFLINE },
    { source: "/v1/:path*", destination: OFFLINE },
    { source: "/media/:path*", destination: OFFLINE },
    { source: "/rtcall", destination: OFFLINE },
    { source: "/rtcall/:path*", destination: OFFLINE },
    { source: "/socket.io", destination: OFFLINE },
    { source: "/socket.io/:path*", destination: OFFLINE },
    { source: "/app", destination: "/app/index.html" },
    { source: "/app/", destination: "/app/index.html" },
    { source: "/app/:path((?!.*\\.).*)", destination: "/app/index.html" },
    { source: "/downloads/:path*", destination: "/public/downloads/:path*" },
    { source: "/privacy", destination: "/privacy.html" },
    { source: "/privacy.html", destination: "/privacy.html" },
  ];
}

function readVercel() {
  return JSON.parse(fs.readFileSync(vercelPath, "utf8"));
}

function writeVercel(obj) {
  fs.writeFileSync(vercelPath, JSON.stringify(obj, null, 2) + "\n", "utf8");
}

export function isPaused() {
  return fs.existsSync(pausedFlag);
}

export function pauseState() {
  if (!fs.existsSync(pausedFlag)) return null;
  try {
    return JSON.parse(fs.readFileSync(pausedFlag, "utf8"));
  } catch {
    return null;
  }
}

/** فصل التطبيق عن VPS — يحفظ vercel.json الأصلي ويستبدل مسارات API بـ offline */
export function enableMaintenanceMode() {
  fs.mkdirSync(stateDir, { recursive: true });
  if (!fs.existsSync(backupPath)) {
    fs.copyFileSync(vercelPath, backupPath);
  }
  const cfg = readVercel();
  cfg.rewrites = maintenanceRewrites();
  writeVercel(cfg);
  const state = {
    pausedAt: new Date().toISOString(),
    vpsHost: "109.199.111.29",
    dataRoot: "/var/lib/retweet",
    resumeHint: "npm run stack:resume",
  };
  fs.writeFileSync(pausedFlag, JSON.stringify(state, null, 2) + "\n", "utf8");
  return state;
}

/** إعادة ربط التطبيق بالـ VPS */
export function disableMaintenanceMode() {
  if (!fs.existsSync(backupPath)) {
    throw new Error("لا يوجد نسخة احتياطية من vercel.json — أعد الملف يدوياً من git");
  }
  fs.copyFileSync(backupPath, vercelPath);
  if (fs.existsSync(pausedFlag)) fs.unlinkSync(pausedFlag);
  return readVercel();
}
