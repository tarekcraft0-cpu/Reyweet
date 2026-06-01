/**
 * يكتب spa/public/firebase-messaging-config.json من متغيرات البيئة (لـ Service Worker).
 * شغّل قبل build:spa أو ضمن build-for-vercel.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "spa/public/firebase-messaging-config.json");

const projectId = (process.env.VITE_FIREBASE_PROJECT_ID || "").trim();
const cfg = {
  apiKey: (process.env.VITE_FIREBASE_API_KEY || "").trim(),
  authDomain: (process.env.VITE_FIREBASE_AUTH_DOMAIN || "").trim() || (projectId ? `${projectId}.firebaseapp.com` : ""),
  projectId,
  storageBucket:
    (process.env.VITE_FIREBASE_STORAGE_BUCKET || "").trim() ||
    (projectId ? `${projectId}.appspot.com` : ""),
  messagingSenderId: (process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "").trim(),
  appId: (process.env.VITE_FIREBASE_APP_ID || "").trim(),
};

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify(cfg, null, 2)}\n`, "utf8");
console.log(`write-firebase-messaging-config: ${out}`);
