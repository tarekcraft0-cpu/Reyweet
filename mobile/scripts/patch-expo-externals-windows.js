/**
 * Node 22+ يضيف `node:sea` إلى `builtinModules`؛ Expo ينشئ مجلداً باسم moduleId في `.expo/metro/externals/`
 * وهذا يفشل على ويندوز لأن `:` غير مسموح في اسم المجلد.
 */
const fs = require("fs");
const path = require("path");

const target = path.join(
  __dirname,
  "..",
  "node_modules",
  "@expo",
  "cli",
  "build",
  "src",
  "start",
  "server",
  "metro",
  "externals.js",
);

if (!fs.existsSync(target)) {
  console.warn("[patch-expo-windows] ملف externals.js غير موجود — تخطّي (شغّل من مجلد mobile بعد npm install).");
  process.exit(0);
}

let s = fs.readFileSync(target, "utf8");
const marker = "if (process.platform === \"win32\" && moduleId.includes(\":\")) continue;";

if (s.includes(marker)) {
  console.log("[patch-expo-windows] التصحيح مُطبَّق مسبقاً.");
  process.exit(0);
}

const needle = `for (const moduleId of NODE_STDLIB_MODULES){
        const shimDir = _path.default.join(projectRoot, METRO_EXTERNALS_FOLDER, moduleId);`;

if (!s.includes(needle)) {
  console.warn("[patch-expo-windows] نمط الكود تغيّر في @expo/cli — راجع تحديث Expo أو استخدم Node 20 LTS.");
  process.exit(0);
}

const replacement = `for (const moduleId of NODE_STDLIB_MODULES){
        if (process.platform === "win32" && moduleId.includes(":")) continue;
        const shimDir = _path.default.join(projectRoot, METRO_EXTERNALS_FOLDER, moduleId);`;

fs.writeFileSync(target, s.replace(needle, replacement), "utf8");
console.log("[patch-expo-windows] تم تعديل externals.js لتجاهل أسماء الموديولات التي تحتوي ':' على ويندوز.");
