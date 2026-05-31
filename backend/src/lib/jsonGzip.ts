import { gzip } from "node:zlib";
import type { Request, Response, NextFunction } from "express";

/** ضغط gzip لاستجابات JSON الكبيرة — يقلّل حجم النقل */
export function jsonGzipMiddleware(req: Request, res: Response, next: NextFunction): void {
  const accept = req.headers["accept-encoding"] ?? "";
  if (!accept.includes("gzip")) {
    next();
    return;
  }
  const originalJson = res.json.bind(res);
  res.json = (body: unknown) => {
    const payload = JSON.stringify(body);
    if (payload.length < 1400) {
      return originalJson(body);
    }
    gzip(payload, (err, compressed) => {
      if (err) {
        originalJson(body);
        return;
      }
      res.setHeader("Content-Encoding", "gzip");
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.send(compressed);
    });
    return res;
  };
  next();
}
