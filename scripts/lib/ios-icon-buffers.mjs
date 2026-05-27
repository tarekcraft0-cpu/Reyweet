import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

/** أسماء ملفات أيقونة SpringBoard داخل .app → الحجم بالبكسل */
export const IOS_APP_ICON_FILES = {
  "AppIcon20x20@2x.png": 40,
  "AppIcon20x20@3x.png": 60,
  "AppIcon29x29@2x.png": 58,
  "AppIcon29x29@3x.png": 87,
  "AppIcon40x40@2x.png": 80,
  "AppIcon40x40@3x.png": 120,
  "AppIcon60x60@2x.png": 120,
  "AppIcon60x60@3x.png": 180,
  "AppIcon76x76@2x~ipad.png": 152,
  "AppIcon83.5x83.5@2x~ipad.png": 167,
};

export async function loadSharp(root) {
  const require = createRequire(import.meta.url);
  for (const id of [path.join(root, "backend/node_modules/sharp"), "sharp"]) {
    try {
      return require(id);
    } catch {
      /* next */
    }
  }
  throw new Error("sharp missing — run: npm install --prefix backend");
}

async function iconPng(sharp, logoSrc, size, paddingRatio = 0.12) {
  const pad = Math.round(size * paddingRatio);
  const inner = size - pad * 2;
  const resized = await sharp(logoSrc)
    .resize(inner, inner, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .png()
    .toBuffer();
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite([{ input: resized, gravity: "centre" }])
    .png()
    .toBuffer();
}

/** كل أحجام أيقونة iOS من شعار Retweet (src/assets/logo.png) */
export async function springboardIconBuffers(root) {
  const logoSrc = path.join(root, "src/assets/logo.png");
  if (!fs.existsSync(logoSrc)) throw new Error(`missing ${logoSrc}`);
  const sharp = await loadSharp(root);

  const files = {};
  for (const [name, px] of Object.entries(IOS_APP_ICON_FILES)) {
    files[name] = await iconPng(sharp, logoSrc, px);
  }
  const icon1024 = await iconPng(sharp, logoSrc, 1024);

  return {
    files,
    icon120: files["AppIcon60x60@2x.png"],
    icon152: files["AppIcon76x76@2x~ipad.png"],
    icon1024,
  };
}

/** شاشة الإقلاع — نفس الشعار (بدون أيقونة Capacitor الافتراضية) */
export async function splashBuffers(root, size = 2732) {
  const logoSrc = path.join(root, "src/assets/logo.png");
  if (!fs.existsSync(logoSrc)) throw new Error(`missing ${logoSrc}`);
  const sharp = await loadSharp(root);
  const logoMax = Math.round(size * 0.35);
  const resized = await sharp(logoSrc)
    .resize(logoMax, logoMax, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .png()
    .toBuffer();
  const buf = await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite([{ input: resized, gravity: "centre" }])
    .png()
    .toBuffer();
  return { buf, size };
}

export function syncXcodeAssetCatalog(root, icons) {
  const appIconSet = path.join(root, "ios", "App", "App", "Assets.xcassets", "AppIcon.appiconset");
  fs.mkdirSync(appIconSet, { recursive: true });
  fs.writeFileSync(path.join(appIconSet, "AppIcon-512@2x.png"), icons.icon1024);

  const splashSet = path.join(root, "ios", "App", "App", "Assets.xcassets", "Splash.imageset");
  if (fs.existsSync(path.join(root, "ios"))) {
    fs.mkdirSync(splashSet, { recursive: true });
  }
}

/**
 * يكتب أيقونات Retweet في .app ويزيل Assets.car (مصدر الأيقونة الخاطئة).
 */
export function applyRetweetIconsToAppBundle(appPath, icons, { removeAssetsCar = true } = {}) {
  for (const [name, buf] of Object.entries(icons.files)) {
    fs.writeFileSync(path.join(appPath, name), buf);
  }

  if (removeAssetsCar) {
    const car = path.join(appPath, "Assets.car");
    if (fs.existsSync(car)) {
      fs.unlinkSync(car);
      return { removedAssetsCar: true };
    }
  }
  return { removedAssetsCar: false };
}
