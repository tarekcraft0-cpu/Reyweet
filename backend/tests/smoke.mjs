#!/usr/bin/env node
/**
 * Smoke tests — يشغّل على خادم محلي أو PUBLIC_URL
 */
const base = (process.env.PUBLIC_URL || "http://127.0.0.1:3000").replace(/\/$/, "");

async function get(path) {
  const res = await fetch(`${base}${path}`);
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  return { status: res.status, json };
}

let failed = 0;

async function check(name, fn) {
  try {
    await fn();
    console.log(`OK ${name}`);
  } catch (e) {
    failed++;
    console.error(`FAIL ${name}:`, e instanceof Error ? e.message : e);
  }
}

await check("health", async () => {
  const { status, json } = await get("/health");
  if (status !== 200 || !json.ok) throw new Error(JSON.stringify(json));
});

await check("auth config", async () => {
  const { status, json } = await get("/auth/config");
  if (status !== 200) throw new Error(`status ${status}`);
  if (typeof json.passwordResetUsesLink !== "boolean") throw new Error("missing passwordResetUsesLink");
});

if (failed > 0) process.exit(1);
console.log("All smoke checks passed.");
