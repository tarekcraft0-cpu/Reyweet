import fs from "node:fs";
import path from "node:path";
import type { Express, Request, Response, NextFunction } from "express";
import express from "express";

/** يخدم landing + SPA من مجلد _vercel_site على نفس منفذ الـ API */
export function mountStaticSite(app: Express, siteDir: string): boolean {
  const root = path.resolve(siteDir);
  if (!fs.existsSync(root)) {
    // eslint-disable-next-line no-console
    console.warn(`[static] missing site dir: ${root}`);
    return false;
  }

  const appDir = path.join(root, "app");
  if (fs.existsSync(path.join(appDir, "index.html"))) {
    app.use(
      "/app",
      express.static(appDir, {
        index: false,
        maxAge: process.env.NODE_ENV === "production" ? "1h" : 0,
      }),
    );
    app.get(/^\/app(\/.*)?$/, (_req: Request, res: Response) => {
      res.sendFile(path.join(appDir, "index.html"));
    });
    // eslint-disable-next-line no-console
    console.log(`[static] SPA → /app/  (${appDir})`);
  }

  app.use(
    express.static(root, {
      index: ["index.html"],
      maxAge: process.env.NODE_ENV === "production" ? "1h" : 0,
    }),
  );

  app.get("*", (req: Request, res: Response, next: NextFunction) => {
    if (
      req.path.startsWith("/auth") ||
      req.path.startsWith("/v1/") ||
      req.path.startsWith("/media/") ||
      req.path === "/health" ||
      req.path.startsWith("/app/")
    ) {
      return next();
    }
    const index = path.join(root, "index.html");
    if (!fs.existsSync(index)) return next();
    res.sendFile(index);
  });

  // eslint-disable-next-line no-console
  console.log(`[static] landing → /  (${root})`);
  return true;
}
