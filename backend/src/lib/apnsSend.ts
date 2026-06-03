import fs from "node:fs/promises";
import http2 from "node:http2";
import jwt from "jsonwebtoken";
import type { PushTokenRow } from "../db/pushTokens.js";
import { buildApnsPayload, type PushDataPayload } from "./pushPayload.js";

function env(key: string): string {
  return (process.env[key] || "").trim();
}

let signingKeyPromise: Promise<string> | null = null;
let providerJwt: { token: string; exp: number } | null = null;

export function isApnsConfigured(): boolean {
  const keyId = env("APNS_KEY_ID");
  const teamId = env("APNS_TEAM_ID");
  const topic = env("APNS_BUNDLE_ID") || "com.reyweet.app";
  const hasKey = !!(env("APNS_KEY_P8") || env("APNS_KEY_PATH"));
  return !!(keyId && teamId && topic && hasKey);
}

/** للتوافق مع الكود القديم */
export function isPushConfigured(): boolean {
  return isApnsConfigured();
}

async function loadSigningKey(): Promise<string> {
  if (!signingKeyPromise) {
    signingKeyPromise = (async () => {
      const inline = env("APNS_KEY_P8");
      if (inline) return inline.replace(/\\n/g, "\n");
      const p = env("APNS_KEY_PATH");
      if (!p) throw new Error("APNS_KEY_P8 or APNS_KEY_PATH required");
      return fs.readFile(p, "utf8");
    })();
  }
  return signingKeyPromise;
}

async function providerAuthorization(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (providerJwt && providerJwt.exp - 120 > now) return providerJwt.token;

  const key = await loadSigningKey();
  const keyId = env("APNS_KEY_ID");
  const teamId = env("APNS_TEAM_ID");
  const token = jwt.sign({}, key, {
    algorithm: "ES256",
    expiresIn: "50m",
    issuer: teamId,
    header: { alg: "ES256", kid: keyId },
  });
  providerJwt = { token, exp: now + 3000 };
  return token;
}

function apnsHost(): string {
  const prod =
    env("APNS_PRODUCTION") === "1" ||
    env("APNS_PRODUCTION") === "true" ||
    process.env.NODE_ENV === "production";
  return prod ? "api.push.apple.com" : "api.sandbox.push.apple.com";
}

function normalizeDeviceToken(raw: string): string {
  return raw.replace(/\s+/g, "").replace(/[<>\s]/g, "").toLowerCase();
}

export async function sendApnsToDevice(
  deviceToken: string,
  title: string,
  body: string,
  data: PushDataPayload = {},
): Promise<{ ok: boolean; status?: number; reason?: string; unregistered?: boolean }> {
  if (!isApnsConfigured()) {
    return { ok: false, reason: "APNs غير مُعدّ" };
  }

  const token = normalizeDeviceToken(deviceToken);
  if (token.length < 32) {
    return { ok: false, reason: "device token غير صالح" };
  }

  const auth = await providerAuthorization();
  const topic = env("APNS_BUNDLE_ID") || "com.reyweet.app";
  const payload = buildApnsPayload({ title, body, data, platform: "ios" });
  const host = apnsHost();

  return new Promise(resolve => {
    const client = http2.connect(`https://${host}`);
    client.on("error", err => {
      client.destroy();
      resolve({ ok: false, reason: err.message });
    });

    const req = client.request({
      ":method": "POST",
      ":path": `/3/device/${token}`,
      authorization: `bearer ${auth}`,
      "apns-topic": topic,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json",
    });

    let bodyText = "";
    req.on("response", headers => {
      const status = Number(headers[":status"] || 0);
      req.on("data", chunk => {
        bodyText += chunk;
      });
      req.on("end", () => {
        client.close();
        const unregistered = status === 410 || bodyText.includes("Unregistered");
        const badToken = status === 400 && bodyText.includes("BadDeviceToken");
        resolve({
          ok: status === 200,
          status,
          reason: bodyText || undefined,
          unregistered: unregistered || badToken,
        });
      });
    });

    req.write(JSON.stringify(payload));
    req.end();
  });
}

export async function sendApnsToTokenRow(
  row: PushTokenRow,
  title: string,
  body: string,
  data: PushDataPayload,
): Promise<boolean> {
  if (row.platform !== "ios") return false;
  const r = await sendApnsToDevice(row.token, title, body, data);
  return r.ok;
}
