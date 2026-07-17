// Browser tests: the "Share an event booking link" widget in the installer console.
// The widget appears in the Jobs view (All tab + city tabs; not Done tab) right after
// the anydayWalkForm. It shows a dropdown of upcoming events, generates a shareable
// booking link on selection, and exposes Share / Copy / QR buttons.
// Runs in Chromium via Playwright; skips (not fails) when no browser can launch.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.join(__dirname, "..", "site");

let chromium = null;
try { ({ chromium } = await import("playwright")); } catch { /* playwright not installed */ }

let server, base, browser, browserOk = false;

before(async () => {
  server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split("?")[0]); if (p === "/") p = "/installer.html";
    const f = path.join(SITE, p);
    if (!f.startsWith(SITE) || !fs.existsSync(f)) { res.writeHead(404); res.end("nf"); return; }
    const ext = path.extname(f);
    res.writeHead(200, { "Content-Type": ext === ".js" ? "text/javascript" : ext === ".html" ? "text/html" : "text/plain" });
    res.end(fs.readFileSync(f));
  });
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
  if (chromium) { try { browser = await chromium.launch(); browserOk = true; } catch { browserOk = false; } }
});

after(async () => { if (browser) await browser.close(); if (server) server.close(); });

// Two upcoming events — one in Fargo, one in Omaha — no bookings.
const ROSTER = { admin: false, events: [
    { city: "Fargo", dateISO: "2099-08-09", installer: "cody" },
    { city: "Omaha", dateISO: "2099-09-12", installer: "cody" }],
  bookings: [] };

async function boot() {
  const page = await (await browser.newContext()).newPage();
  await page.route("**/sw.js", (r) => r.fulfill({ status: 200, contentType: "text/javascript", body: "/*noop*/" }));
  await page.route("**/installer-roster**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ROSTER) }));
  await page.route("**/amsoil-metrics**", (r) => r.fulfill({ status: 200, body: "{}" }));
  await page.route("**/event-qr**", (r) => r.fulfill({ status: 200, contentType: "image/svg+xml", body: "<svg xmlns='http://www.w3.org/2000/svg'/>" }));
  await page.addInitScript(() => localStorage.setItem("ty_installer_token", "t"));
  await page.goto(base + "/installer.html");
  await page.waitForFunction(() => !document.getElementById("app").classList.contains("hidden"));
  await page.waitForFunction(() => !!document.querySelector("#subtabs .tabbtn"));
  return page;
}

test("share widget lists upcoming events and generates the link on selection", async (t) => {
  if (!browserOk) return t.skip("no browser available");
  const page = await boot();
  await page.click("#evshare summary");
  await page.waitForSelector("#evshare select");
  const opts = await page.evaluate(() => [...document.querySelectorAll("#evshare select option")].map((o) => o.textContent));
  assert.ok(opts.some((o) => /Fargo/.test(o)) && opts.some((o) => /Omaha/.test(o)));
  await page.selectOption("#evshare select", { index: 1 });
  const link = await page.evaluate(() => document.getElementById("evsharelink").textContent);
  assert.match(link, /tunedyota\.com\/book\/(fargo|omaha)-2099-\d{2}-\d{2}/);
  const btns = await page.evaluate(() => document.getElementById("evshare").textContent);
  assert.match(btns, /Copy/); assert.match(btns, /QR/);
  await page.close();
});

test("QR button reveals the event-qr image for the selected slug", async (t) => {
  if (!browserOk) return t.skip("no browser available");
  const page = await boot();
  await page.click("#evshare summary");
  await page.waitForSelector("#evshare select");
  await page.selectOption("#evshare select", { index: 1 });
  await page.click("#evshareqr");
  const src = await page.evaluate(() => (document.querySelector("#evshare img") || {}).src || "");
  assert.match(src, /event-qr\?e=(fargo|omaha)-2099/);
  await page.close();
});
