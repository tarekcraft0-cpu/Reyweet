const STORAGE_KEY = "retweet_device_fp_v1";

export function getDeviceLabel(): string {
  if (typeof navigator === "undefined") return "جهاز";
  const ua = navigator.userAgent;
  if (/iPhone/i.test(ua)) return "آيفون";
  if (/iPad/i.test(ua)) return "آيباد";
  if (/Android/i.test(ua)) return "أندرويد";
  if (/Windows/i.test(ua)) return "ويندوز";
  if (/Mac OS/i.test(ua)) return "ماك";
  if (/Linux/i.test(ua)) return "لينكس";
  return ua.slice(0, 80) || "متصفح";
}

async function hashFingerprintMaterial(material: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    let h = 0;
    for (let i = 0; i < material.length; i++) h = (h * 31 + material.charCodeAt(i)) >>> 0;
    return `fb${h.toString(16).padStart(8, "0")}`;
  }
  const data = new TextEncoder().encode(material);
  const digest = await subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function createFingerprint(): Promise<string> {
  if (typeof navigator === "undefined") return hashFingerprintMaterial("server");
  const parts = [
    navigator.userAgent,
    navigator.language,
    String(screen.width),
    String(screen.height),
    String(screen.colorDepth),
    String(new Date().getTimezoneOffset()),
    navigator.platform || "",
  ];
  return hashFingerprintMaterial(parts.join("|"));
}

/** بصمة جهاز ثابتة لهذا المتصفح/التطبيق */
export async function getOrCreateDeviceFingerprint(): Promise<string> {
  if (typeof window === "undefined") return "";
  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing && existing.length >= 16) return existing;
  } catch {
    /* ignore */
  }
  const fp = await createFingerprint();
  try {
    localStorage.setItem(STORAGE_KEY, fp);
  } catch {
    /* ignore */
  }
  return fp;
}
