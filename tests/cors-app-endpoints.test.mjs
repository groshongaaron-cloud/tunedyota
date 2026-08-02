// Every Netlify function the app bundle calls must answer CORS for the native
// WebView origins. CapacitorHttp normally bypasses CORS at the native layer,
// but any path it doesn't intercept (Request objects, XHR in vendor code,
// service-worker fetches, plugin disabled) hits real preflights — so the
// functions themselves must speak CORS, same as member-data/client-auth do.
// The endpoint list is DERIVED from the same sources sync-lib.mjs bundles,
// so adding a new endpoint to a bundled page forces CORS on it here.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { PAGES, ASSETS } from "../app/scripts/sync-lib.mjs";

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = path.join(ROOT, "site");
const FUNCTIONS = path.join(ROOT, "netlify", "functions");

const { corsHeaders, withCors, ALLOWED_ORIGINS } = require("../netlify/functions/lib/cors.js");

function bundledEndpoints() {
  const files = [...PAGES.map(([src]) => src), ...ASSETS]
    .map((f) => path.join(SITE, f))
    .filter((f) => fs.existsSync(f));
  const names = new Set();
  for (const f of files) {
    const text = fs.readFileSync(f, "utf8");
    for (const m of text.matchAll(/\.netlify\/functions\/([a-z0-9-]+)/g)) names.add(m[1]);
  }
  return [...names].sort();
}

test("bundle sweep finds the known endpoints", () => {
  const names = bundledEndpoints();
  assert.ok(names.includes("member-data"), "sweep must see member-data");
  assert.ok(names.includes("installer-roster"), "sweep must see installer-roster");
  assert.ok(names.length >= 20, `suspiciously few endpoints found: ${names.length}`);
});

test("withCors answers OPTIONS preflight with 204 + app-origin headers", async () => {
  const wrapped = withCors(async () => { throw new Error("handler must not run on OPTIONS"); });
  const res = await wrapped({ httpMethod: "OPTIONS", headers: { origin: "https://localhost" } });
  assert.equal(res.statusCode, 204);
  assert.equal(res.headers["Access-Control-Allow-Origin"], "https://localhost");
});

test("withCors merges CORS headers into the handler response, handler headers win", async () => {
  const wrapped = withCors(async (event) => ({
    statusCode: 200,
    headers: { "Content-Type": "application/json", "Vary": "custom" },
    body: JSON.stringify({ path: event.path }),
  }));
  const res = await wrapped({ httpMethod: "GET", headers: { origin: "capacitor://localhost" }, path: "/x" });
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["Access-Control-Allow-Origin"], "capacitor://localhost");
  assert.equal(res.headers["Content-Type"], "application/json");
  assert.equal(res.headers["Vary"], "custom", "handler-set headers must not be clobbered");
  assert.equal(JSON.parse(res.body).path, "/x");
});

test("withCors falls back to the site origin for unknown origins", async () => {
  const wrapped = withCors(async () => ({ statusCode: 200, body: "" }));
  const res = await wrapped({ httpMethod: "GET", headers: { origin: "https://evil.example" } });
  assert.equal(res.headers["Access-Control-Allow-Origin"], "https://tunedyota.com");
  assert.ok(!ALLOWED_ORIGINS.includes("https://evil.example"));
});

test("every app-bundled endpoint answers an app-origin preflight", async () => {
  const failures = [];
  for (const name of bundledEndpoints()) {
    const file = path.join(FUNCTIONS, name + ".js");
    if (!fs.existsSync(file)) { failures.push(`${name}: no function file`); continue; }
    let handler;
    try { ({ handler } = require(file)); } catch (e) { failures.push(`${name}: require failed (${e.message})`); continue; }
    let res;
    try {
      res = await handler({ httpMethod: "OPTIONS", headers: { origin: "https://localhost" }, body: "" });
    } catch (e) { failures.push(`${name}: OPTIONS threw (${e.message})`); continue; }
    const h = (res && res.headers) || {};
    if (!res || res.statusCode !== 204) failures.push(`${name}: OPTIONS -> ${res && res.statusCode}, want 204`);
    else if (h["Access-Control-Allow-Origin"] !== "https://localhost") failures.push(`${name}: missing/wrong Access-Control-Allow-Origin`);
  }
  assert.deepEqual(failures, [], "endpoints without app CORS:\n" + failures.join("\n"));
});

test("corsHeaders still covers all three WebView origins", () => {
  for (const origin of ["capacitor://localhost", "https://localhost", "http://localhost"]) {
    assert.equal(corsHeaders(origin)["Access-Control-Allow-Origin"], origin);
  }
});
