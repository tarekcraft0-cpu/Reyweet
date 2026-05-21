/**
 * Writes iOS OTA manifest.plist with absolute HTTPS URLs (required by Apple).
 *
 * Set LANDING_SITE_URL (e.g. https://retweet.example.com) or pass as argv[2].
 * On Vercel, VERCEL_URL is used when LANDING_SITE_URL is unset.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const landingRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outRoot = process.argv[2] ? path.resolve(process.argv[2]) : landingRoot;

/** Production landing (Vercel). Override with LANDING_SITE_URL if the domain changes. */
const DEFAULT_SITE_URL = "https://reyweet.vercel.app";

function siteBaseUrl() {
  const explicit = process.env.LANDING_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/$/, "")}`;

  return DEFAULT_SITE_URL.replace(/\/$/, "");
}

const base = siteBaseUrl();
const ipaUrl = base
  ? `${base}/downloads/retweet.ipa`
  : "https://YOUR-DOMAIN.example/downloads/retweet.ipa";

const iconUrl = base ? `${base}/public/logo.png` : "";

const bundleId = process.env.IOS_BUNDLE_ID?.trim() || "com.reyweet.app";
const bundleVersion = process.env.IOS_BUNDLE_VERSION?.trim() || "1.0.0";
const title = process.env.IOS_APP_TITLE?.trim() || "Reyweet";

const imageAssets =
  iconUrl &&
  `
        <dict>
          <key>kind</key>
          <string>display-image</string>
          <key>url</key>
          <string>${iconUrl}</string>
        </dict>
        <dict>
          <key>kind</key>
          <string>full-size-image</string>
          <key>url</key>
          <string>${iconUrl}</string>
        </dict>`;

const downloadsDir = path.join(outRoot, "public", "downloads");
mkdirSync(downloadsDir, { recursive: true });

const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>items</key>
  <array>
    <dict>
      <key>assets</key>
      <array>
        <dict>
          <key>kind</key>
          <string>software-package</string>
          <key>url</key>
          <string>${ipaUrl}</string>
        </dict>${imageAssets || ""}
      </array>
      <key>metadata</key>
      <dict>
        <key>bundle-identifier</key>
        <string>${bundleId}</string>
        <key>bundle-version</key>
        <string>${bundleVersion}</string>
        <key>kind</key>
        <string>software</string>
        <key>title</key>
        <string>${title}</string>
      </dict>
    </dict>
  </array>
</dict>
</plist>
`;

const dest = path.join(downloadsDir, "manifest.plist");
writeFileSync(dest, plist, "utf8");

if (!base) {
  console.warn(
    "write-manifest: set LANDING_SITE_URL (or deploy on Vercel) so manifest.plist points to your real domain.",
  );
} else {
  console.log(`write-manifest: ${dest} → ${ipaUrl}`);
}

if (!existsSync(path.join(downloadsDir, "retweet.ipa"))) {
  console.warn("write-manifest: retweet.ipa not found — add it to landing/public/downloads/ before publishing.");
}
