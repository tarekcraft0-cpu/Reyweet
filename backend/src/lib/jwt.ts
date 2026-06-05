import jwt from "jsonwebtoken";
import type { SignOptions } from "jsonwebtoken";

const secret = () => {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 16) {
    throw new Error("JWT_SECRET missing or too short (use at least 16 characters)");
  }
  return s;
};

export function signAccessToken(
  userId: string,
  tokenVersion = 1,
  expiresIn: SignOptions["expiresIn"] = "48h",
): string {
  const options: SignOptions = { expiresIn, algorithm: "HS256" };
  return jwt.sign({ sub: userId, tv: tokenVersion }, secret(), options);
}

export function verifyAccessToken(token: string): { sub: string; tv?: number } {
  const p = jwt.verify(token, secret(), { algorithms: ["HS256"] });
  if (typeof p === "string" || typeof p !== "object" || !p) throw new Error("invalid token");
  const payload = p as jwt.JwtPayload;
  const sub = payload.sub;
  if (!sub || typeof sub !== "string") throw new Error("invalid token");
  const tvRaw = payload.tv;
  const tv = typeof tvRaw === "number" ? tvRaw : undefined;
  return { sub, tv };
}
