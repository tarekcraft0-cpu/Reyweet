import jwt from "jsonwebtoken";
import type { SignOptions } from "jsonwebtoken";

const secret = () => {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 16) {
    throw new Error("JWT_SECRET missing or too short (use at least 16 characters)");
  }
  return s;
};

export function signAccessToken(userId: string, expiresIn: SignOptions["expiresIn"] = "7d"): string {
  const options: SignOptions = { expiresIn, algorithm: "HS256" };
  return jwt.sign({ sub: userId }, secret(), options);
}

export function verifyAccessToken(token: string): { sub: string } {
  const p = jwt.verify(token, secret(), { algorithms: ["HS256"] });
  if (typeof p === "string" || typeof p !== "object" || !p) throw new Error("invalid token");
  const sub = (p as jwt.JwtPayload).sub;
  if (!sub || typeof sub !== "string") throw new Error("invalid token");
  return { sub };
}
