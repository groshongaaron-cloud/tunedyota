// Browser regression tests for the installer-console walk-in flow (site/installer.html).
// Guards the two field bugs fixed 2026-07-14:
//   1. Infinite roster-fetch loop (flushQueue → load → flushQueue …) that wiped the
//      walk-in form mid-entry, so a SECOND consecutive walk-in could not be completed.
//   2. City <select> restricted to roster cities silently mis-filed a walk-in in a
//      market not yet on the roster (now a free-text field + datalist suggestions).
//
// Runs in Chromium via Playwright. If a browser can't launch (CI without browsers),
// the whole suite skips rather than fails.
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

// Boot a page with a stubbed roster + a walk-in endpoint that emulates create + clientKey
// dedupe + unknown-city rejection. Returns { page, created }.
async function boot(roster) {
  const created = []; const byCK = new Map();
  const page = await (await browser.newContext()).newPage();
  await page.route("**/sw.js", (r) => r.fulfill({ status: 200, contentType: "text/javascript", body: "/*noop*/" }));
  await page.route("**/installer-roster**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(roster) }));
  await page.route("**/amsoil-metrics**", (r) => r.fulfill({ status: 200, body: "{}" }));
  await page.route("**/installer-walkin**", async (r) => {
    const b = JSON.parse(r.request().postData() || "{}");
    const name = (b.name || "").trim(), phone = (b.phone || "").trim(), city = (b.city || "").trim(), ck = (b.clientKey || "").trim();
    if (!name || !phone) return r.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ status: "error", error: "missing-contact" }) });
    if (!city || city === "Nowhere") return r.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ status: "error", error: "unknown-city" }) });
    if (ck && byCK.has(ck)) { const g = byCK.get(ck); return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "booked", recordId: g.id, booking: g.booking }) }); }
    const id = "rec" + (created.length + 1);
    const booking = { id, city, dateISO: b.dateISO, installer: "cody", name, vehicle: b.vehicle || "", phone, email: b.email || "", status: "Booked", isWalkin: true };
    created.push({ name, city, id }); if (ck) byCK.set(ck, { id, booking });
    return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "booked", recordId: id, booking }) });
  });
  await page.addInitScript(() => localStorage.setItem("ty_installer_token", "t"));
  await page.goto(base + "/installer.html");
  await page.waitForFunction(() => !document.getElementById("app").classList.contains("hidden"));
  await page.waitForFunction(() => !!document.querySelector("#feed details.evt"));
  await page.waitForTimeout(120);
  return { page, created };
}

// Fill + submit the top "Log a walk-in / call-in" (anyday) form.
async function anyday(page, v) {
  return await page.evaluate((v) => {
    const det = document.querySelector("#feed details.evt");
    if (!det.open) { det.open = true; det.dispatchEvent(new Event("toggle")); }
    const form = det.querySelector(".ebody.walkmini");
    const byPh = (f) => Array.from(form.querySelectorAll("input")).find((i) => (i.placeholder || "").toLowerCase().includes(f));
    byPh("name").value = v.name; byPh("vehicle").value = v.vehicle; byPh("phone").value = v.phone;
    const cityInput = byPh("city"); cityInput.value = v.city;
    form.querySelector("button.addwalk").click();
    return { cityIsFreeText: !form.querySelector("select") && !!cityInput };
  }, v);
}
const msgText = (page) => page.evaluate(() => document.getElementById("msg").textContent);

test("no infinite roster-fetch loop after load (regression: flushQueue↔load recursion)", async (t) => {
  if (!browserOk) return t.skip("no browser available");
  let hits = 0;
  const page = await (await browser.newContext()).newPage();
  await page.route("**/sw.js", (r) => r.fulfill({ status: 200, contentType: "text/javascript", body: "/*noop*/" }));
  await page.route("**/installer-roster**", (r) => { hits++; return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ bookings: [], events: [], admin: false }) }); });
  await page.route("**/amsoil-metrics**", (r) => r.fulfill({ status: 200, body: "{}" }));
  await page.addInitScript(() => localStorage.setItem("ty_installer_token", "t"));
  await page.goto(base + "/installer.html");
  await page.waitForFunction(() => !document.getElementById("app").classList.contains("hidden"));
  await page.waitForTimeout(2500);
  await page.close();
  assert.ok(hits <= 3, `roster fetched ${hits} times in 2.5s — expected a small constant, not a loop`);
});

test("two consecutive walk-ins in DIFFERENT cities are both created with the correct city", async (t) => {
  if (!browserOk) return t.skip("no browser available");
  const { page, created } = await boot({ bookings: [], events: [], admin: false });
  const s1 = await anyday(page, { name: "Alice", vehicle: "2021 Tundra", phone: "6055551111", city: "Sioux Falls" });
  await page.waitForTimeout(120);
  await anyday(page, { name: "Bob", vehicle: "2022 Tacoma", phone: "6055552222", city: "Omaha" });
  await page.waitForTimeout(120);
  await page.close();
  assert.equal(s1.cityIsFreeText, true, "city field must be free-text so any market is enterable");
  assert.deepEqual(created.map((c) => `${c.name}/${c.city}`), ["Alice/Sioux Falls", "Bob/Omaha"]);
});

test("three consecutive same-city walk-ins all succeed (form survives re-render)", async (t) => {
  if (!browserOk) return t.skip("no browser available");
  const today = new Date().toISOString().slice(0, 10);
  const { page, created } = await boot({ bookings: [], events: [{ city: "Fargo", dateISO: today, installer: "cody" }], admin: false });
  for (const n of ["One", "Two", "Three"]) { await anyday(page, { name: n, vehicle: "Tundra", phone: "5", city: "Fargo" }); await page.waitForTimeout(120); }
  await page.close();
  assert.deepEqual(created.map((c) => c.name), ["One", "Two", "Three"]);
});

test("an unrecognized city shows a loud error and creates nothing (no silent misfile)", async (t) => {
  if (!browserOk) return t.skip("no browser available");
  const { page, created } = await boot({ bookings: [], events: [], admin: false });
  await anyday(page, { name: "Zed", vehicle: "T", phone: "9", city: "Nowhere" });
  await page.waitForTimeout(150);
  const m = await msgText(page);
  await page.close();
  assert.equal(created.length, 0);
  assert.match(m, /isn.t a recognized market/);
});
