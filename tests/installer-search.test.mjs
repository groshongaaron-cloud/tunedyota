// Browser regression tests for console booking search: digit-normalized phone
// matching (typing 6125551234 finds "(612) 555-1234"), and email / event-date /
// ECU-ID matching for closed bookings. Chromium via Playwright; skips w/o browser.
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

const ROSTER = {
  admin: false, installer: "cody", events: [],
  bookings: [
    { id: "s1", city: "Omaha", dateISO: "2026-06-28", installer: "cody", slot: "9:00", slotLabel: "9:00 AM",
      name: "Frank DeRosa", vehicle: "Tundra", phone: "(612) 555-1234", email: "frank@example.com",
      status: "Completed", calibration: "Medium", ecuId: "EAA2", commission: 165 },
    { id: "s2", city: "Lincoln", dateISO: "2026-07-04", installer: "cody", slot: "9:20", slotLabel: "9:20 AM",
      name: "Sara Voss", vehicle: "Tacoma", phone: "(402) 555-9876", email: "sara@example.com",
      status: "Completed", calibration: "Spicy", ecuId: "EBB7", commission: 165 },
  ],
};

async function boot() {
  const page = await (await browser.newContext()).newPage();
  await page.route("**/sw.js", (r) => r.fulfill({ status: 200, contentType: "text/javascript", body: "/*noop*/" }));
  await page.route("**/installer-roster**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ROSTER) }));
  await page.route("**/installer-prefs**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "ok", theme: "" }) }));
  await page.addInitScript(() => localStorage.setItem("ty_installer_token", "t"));
  await page.goto(base + "/installer.html");
  await page.waitForFunction(() => !document.getElementById("app").classList.contains("hidden"));
  await page.waitForFunction(() => !!document.getElementById("q"));
  return page;
}

async function search(page, q) {
  await page.fill("#q", q);
  await page.waitForFunction(() => /Search results \(\d+\)/.test(document.getElementById("feed").textContent));
  return page.evaluate(() => document.getElementById("feed").textContent);
}

test("digits-only query matches a formatted phone number", async (t) => {
  if (!browserOk) return t.skip("no browser available");
  const page = await boot();
  const feed = await search(page, "6125551234");
  assert.match(feed, /Search results \(1\)/);
  assert.match(feed, /Frank DeRosa/);
  await page.context().close();
});

test("email query finds the closed booking", async (t) => {
  if (!browserOk) return t.skip("no browser available");
  const page = await boot();
  const feed = await search(page, "sara@example.com");
  assert.match(feed, /Search results \(1\)/);
  assert.match(feed, /Sara Voss/);
  await page.context().close();
});

test("event-date query pulls up that day's bookings", async (t) => {
  if (!browserOk) return t.skip("no browser available");
  const page = await boot();
  const feed = await search(page, "2026-06-28");
  assert.match(feed, /Search results \(1\)/);
  assert.match(feed, /Frank DeRosa/);
  await page.context().close();
});

test("ECU ID query finds the closed booking", async (t) => {
  if (!browserOk) return t.skip("no browser available");
  const page = await boot();
  const feed = await search(page, "EBB7");
  assert.match(feed, /Search results \(1\)/);
  assert.match(feed, /Sara Voss/);
  await page.context().close();
});
