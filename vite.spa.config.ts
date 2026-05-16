import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.resolve(rootDir, "src");

/** بناء تطبيق الويب الثابت لمسار /app على Vercel */
export default defineConfig({
  root: path.resolve(rootDir, "spa"),
  base: "/app/",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": srcDir,
    },
  },
  build: {
    outDir: path.resolve(rootDir, "spa-dist"),
    emptyOutDir: true,
  },
});
