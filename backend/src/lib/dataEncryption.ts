import crypto from "node:crypto";

const SNAPSHOT_MAGIC = "retweet-enc-v1";
const IV_LEN = 12;

function deriveKey(): Buffer | null {
  const secret = process.env.DATA_ENCRYPTION_KEY?.trim();
  if (!secret || secret.length < 16) return null;
  return crypto.scryptSync(secret, "retweet-data-at-rest-v1", 32);
}

export function dataEncryptionEnabled(): boolean {
  return deriveKey() != null;
}

type EncEnvelope = {
  _enc: typeof SNAPSHOT_MAGIC;
  iv: string;
  tag: string;
  data: string;
};

function isEnvelope(raw: unknown): raw is EncEnvelope {
  return (
    !!raw &&
    typeof raw === "object" &&
    (raw as EncEnvelope)._enc === SNAPSHOT_MAGIC &&
    typeof (raw as EncEnvelope).iv === "string" &&
    typeof (raw as EncEnvelope).tag === "string" &&
    typeof (raw as EncEnvelope).data === "string"
  );
}

export function encryptPayload(value: unknown): unknown {
  const key = deriveKey();
  if (!key) return value;
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const plain = Buffer.from(JSON.stringify(value), "utf8");
  const enc = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    _enc: SNAPSHOT_MAGIC,
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: enc.toString("base64"),
  } satisfies EncEnvelope;
}

export function decryptPayload(raw: unknown): unknown {
  if (!isEnvelope(raw)) return raw;
  const key = deriveKey();
  if (!key) return raw;
  try {
    const iv = Buffer.from(raw.iv, "base64");
    const tag = Buffer.from(raw.tag, "base64");
    const data = Buffer.from(raw.data, "base64");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const out = Buffer.concat([decipher.update(data), decipher.final()]);
    return JSON.parse(out.toString("utf8"));
  } catch {
    return null;
  }
}
