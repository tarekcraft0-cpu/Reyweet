import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

export function readPublicApiUrl() {
  const apiFile = path.join(root, "PUBLIC_API_URL.txt");
  if (fs.existsSync(apiFile)) {
    const line = fs
      .readFileSync(apiFile, "utf8")
      .split(/\r?\n/)
      .map(l => l.trim())
      .find(l => l.startsWith("http"));
    if (line) return line.replace(/\/$/, "");
  }

  const fromEnv = (process.env.RETWEET_PUBLIC_API_URL || process.env.RETWEET_STABLE_URL || "")
    .trim()
    .replace(/\/$/, "");
  if (fromEnv) return fromEnv;

  const envPath = path.join(root, ".env");
  if (fs.existsSync(envPath)) {
    const text = fs.readFileSync(envPath, "utf8");
    for (const key of ["RETWEET_PUBLIC_API_URL", "RETWEET_STABLE_URL"]) {
      const m = text.match(new RegExp(`^${key}=(.+)$`, "m"));
      if (m?.[1]?.trim()) return m[1].trim().replace(/\/$/, "");
    }
  }

  const tunnelFile = path.join(root, "PUBLIC_TUNNEL_URL.txt");
  if (fs.existsSync(tunnelFile)) {
    const line = fs
      .readFileSync(tunnelFile, "utf8")
      .split(/\r?\n/)
      .map(l => l.trim())
      .find(l => l.startsWith("http"));
    if (line) return line.replace(/\/$/, "");
  }

  return "";
}

export const VERCEL_SITE_URL = "https://reyweet.vercel.app";
