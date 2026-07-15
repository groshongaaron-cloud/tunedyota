// Browser regression test for the installer-console Leads view (site/installer.html).
// Serves site/, stubs the endpoints, drives the Jobs↔Leads toggle + log-a-lead flow.
// Skips cleanly if a browser can't launch (CI without browsers).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.join(__dirname, "..", "site");
let chromium = null; try { ({ chromium } = await import("playwright")); } catch {}
let server, base, browser, ok = false;

before(async () => {
  server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split("?")[0]); if (p === "/") p = "/installer.html";
    const f = path.join(SITE, p); if (!f.startsWith(SITE) || !fs.existsSync(f)) { res.writeHead(404); res.end("nf"); return; }
    const ext = path.extname(f);
    res.writeHead(200, { "Content-Type": ext === ".js" ? "text/javascript" : ext === ".html" ? "text/html" : "text/plain" });
    res.end(fs.readFileSync(f));
  });
  await new Promise((r) => server.listen(0, r)); base = `http://127.0.0.1:${server.address().port}`;
  if (chromium) { try { browser = await chromium.launch(); ok = true; } catch { ok = false; } }
});
after(async () => { if (browser) await browser.close(); if (server) server.close(); });

async function boot() {
  const leads = [];
  const page = await (await browser.newContext()).newPage();
  await page.route("**/sw.js", (r) => r.fulfill({ status: 200, contentType: "text/javascript", body: "/*x*/" }));
  await page.route("**/installer-roster**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ bookings: [], events: [], admin: false }) }));
  await page.route("**/amsoil-metrics**", (r) => r.fulfill({ status: 200, body: "{}" }));
  await page.route("**/leads-list**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ leads, admin: false, summary: {} }) }));
  await page.route("**/lead-ingest**", async (r) => {
    const b = JSON.parse(r.request().postData() || "{}");
    leads.push({ id: "L" + (leads.length + 1), name: b.name, vehicle: b.vehicle, phone: b.phone, email: b.email,
      city: b.city, channel: b.channel, stage: "New", installer: "cody", nextFollowup: "", lastContact: "2026-07-14", activity: "", convertedBooking: "" });
    await r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "lead", recordId: "L", deduped: false }) });
  });
  await page.addInitScript(() => localStorage.setItem("ty_installer_token", "t"));
  await page.goto(base + "/installer.html");
  await page.waitForFunction(() => !document.getElementById("app").classList.contains("hidden"));
  await page.waitForTimeout(150);
  return { page, leads };
}

test("switch to Leads, log a lead, it appears under New", async (t) => {
  if (!ok) return t.skip("no browser");
  const { page } = await boot();
  await page.click('.tabbtn[data-tab="leads"]');
  await page.waitForTimeout(100);
  await page.evaluate(() => {
    const det = document.querySelector("#feed details.evt");
    if (!det.open) { det.open = true; det.dispatchEvent(new Event("toggle")); }
    const form = det.querySelector(".ebody.walkmini");
    const byPh = (f) => Array.from(form.querySelectorAll("input")).find((i) => (i.placeholder || "").toLowerCase().includes(f));
    byPh("name").value = "Dana"; byPh("phone").value = "6055551212"; byPh("vehicle").value = "Tundra";
    form.querySelector("button.addwalk").click();
  });
  await page.waitForTimeout(200);
  const txt = await page.evaluate(() => document.getElementById("feed").textContent);
  await page.close();
  assert.match(txt, /New \(1\)/);
  assert.match(txt, /Dana/);
});
