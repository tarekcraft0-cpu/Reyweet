import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/** يتحقق إن كان IPA موقّعاً (يصلح لتثبيت Safari OTA). */
export function isIpaSigned(ipaPath) {
  if (!ipaPath || !existsSync(ipaPath)) return false;
  if (process.env.IOS_IPA_SIGNED === "1") return true;
  if (process.env.IOS_IPA_SIGNED === "0") return false;
  try {
    const buf = readFileSync(ipaPath);
    const text = buf.toString("latin1");
    return (
      text.includes("embedded.mobileprovision") ||
      text.includes("_CodeSignature/CodeResources") ||
      text.includes("PKCS7")
    );
  } catch {
    return false;
  }
}
