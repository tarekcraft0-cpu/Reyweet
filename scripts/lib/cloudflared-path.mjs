import fs from "node:fs";

export function findCloudflared() {
  const candidates = [
    process.env.CLOUDFLARED_PATH,
    "cloudflared",
    "C:\\Program Files (x86)\\cloudflared\\cloudflared.exe",
    "C:\\Program Files\\cloudflared\\cloudflared.exe",
  ].filter(Boolean);
  for (const c of candidates) {
    if (c === "cloudflared" || fs.existsSync(c)) return c;
  }
  return "cloudflared";
}
