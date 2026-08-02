// Browser regression test for the convert-from-lead flow (site/installer.html).
// The installer's seat: open a lead with NO city, see upcoming events anyway,
// pick one, get its real open slots, correct wrong fields inline, convert —
// and a full event warns but never blocks (owner freedom).
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

const LEAD = { id: "L1", name: "Text (612) 555-0134", phone: "(612) 555-0134", email: "",
  vehicle: "", city: "", channel: "sms", stage: "New", installer: "cody",
  nextFollowup: "", lastContact: "2026-08-01", activity: "", convertedBooking: "", duplicates: [], matches: [] };
const EVENTS = [{ city: "Madison", dateISO: "2026-08-08", installer: "cody" },
                { city: "Omaha", dateISO: "2026-08-15", installer: "cody" }];

async function boot({ madisonFull = false } = {}) {
  const posts = [];
  const page = await (await browser.newContext()).newPage();
  await page.route("**/sw.js", (r) => r.fulfill({ status: 200, contentType: "text/javascript", body: "/*x*/" }));
  await page.route("**/installer-roster**", (r) => r.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ bookings: [], events: EVENTS, admin: false }) }));
  await page.route("**/amsoil-metrics**", (r) => r.fulfill({ status: 200, body: "{}" }));
  await page.route("**/leads-list**", (r) => r.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ leads: [LEAD], admin: false, summary: {} }) }));
  await page.route("**/availability**", (r) => {
    const city = new URL(r.request().url()).searchParams.get("city") || "";
    const madison = { dateISO: "2026-08-08", openSlots: madisonFull ? [] : ["10:20", "10:40"], full: madisonFull,
      slotLabels: { "10:20": "10:20 AM", "10:40": "10:40 AM" } };
    const omaha = { dateISO: "2026-08-15", openSlots: ["9:00"], full: false, slotLabels: { "9:00": "9:00 AM" } };
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(
      city.toLowerCase() === "madison"
        ? { city: "Madison", hasEvent: true, slotMode: "times", events: [madison] }
        : { city: "Omaha", hasEvent: true, slotMode: "times", events: [omaha] }) });
  });
  await page.route("**/lead-update**", async (r) => {
    posts.push(JSON.parse(r.request().postData() || "{}"));
    await r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "ok",
      bookingId: "recNEW", stage: "Booked",
      booking: { id: "recNEW", city: "Madison", dateISO: "2026-08-08", installer: "cody", slot: "10:20",
        slotLabel: "10:20 AM", name: "Eli", vehicle: "2019 Tundra", status: "Booked" } }) });
  });
  await page.addInitScript(() => localStorage.setItem("ty_installer_token", "t"));
  await page.goto(base + "/installer.html");
  await page.waitForFunction(() => !document.getElementById("app").classList.contains("hidden"));
  await page.click('.tabbtn[data-tab="leads"]');
  await page.waitForSelector('#feed details.evt[data-lead-id="L1"]');
  await page.evaluate(() => {
    const det = document.querySelector('#feed details.evt[data-lead-id="L1"]');
    if (!det.open) { det.open = true; det.dispatchEvent(new Event("toggle")); }
  });
  return { page, posts };
}

test("event picker lists upcoming events even when the lead has no city", async (t) => {
  if (!ok) return t.skip("no browser");
  const { page } = await boot();
  const opts = await page.$$eval('details[data-lead-id="L1"] [data-conv="event"] option',
    (os) => os.map((o) => o.textContent));
  await page.close();
  assert.ok(opts.some((s) => /Madison/.test(s) && /2026-08-08/.test(s)), "Madison event offered: " + JSON.stringify(opts));
  assert.ok(opts.some((s) => /Omaha/.test(s)), "Omaha event offered too");
});

test("choosing an event sets the date and offers its real open slots", async (t) => {
  if (!ok) return t.skip("no browser");
  const { page } = await boot();
  await page.selectOption('details[data-lead-id="L1"] [data-conv="event"]', { index: 1 });
  await page.waitForFunction(() =>
    document.querySelectorAll('details[data-lead-id="L1"] [data-conv="slot"] option').length > 1);
  const date = await page.$eval('details[data-lead-id="L1"] [data-conv="date"]', (i) => i.value);
  const slots = await page.$$eval('details[data-lead-id="L1"] [data-conv="slot"] option',
    (os) => os.map((o) => o.textContent));
  await page.close();
  assert.equal(date, "2026-08-08");
  assert.ok(slots.some((s) => /10:20 AM/.test(s)), "open slot offered: " + JSON.stringify(slots));
});

test("inline corrections + slot ride the convert request", async (t) => {
  if (!ok) return t.skip("no browser");
  const { page, posts } = await boot();
  await page.selectOption('details[data-lead-id="L1"] [data-conv="event"]', { index: 1 });
  await page.waitForFunction(() =>
    document.querySelectorAll('details[data-lead-id="L1"] [data-conv="slot"] option').length > 1);
  await page.fill('details[data-lead-id="L1"] [data-conv="name"]', "Eli Soetenga");
  await page.fill('details[data-lead-id="L1"] [data-conv="vehicle"]', "2019 Tundra 5.7L");
  await page.fill('details[data-lead-id="L1"] [data-conv="year"]', "2019");
  await page.selectOption('details[data-lead-id="L1"] [data-conv="slot"]', "10:20");
  await page.click('details[data-lead-id="L1"] [data-conv="go"]');
  await page.waitForFunction(() => document.body.textContent.includes("✓ Booked"));
  await page.close();
  const conv = posts.find((p) => p.action === "convert");
  assert.ok(conv, "convert posted");
  assert.equal(conv.dateISO, "2026-08-08");
  assert.equal(conv.slot, "10:20");
  assert.equal(conv.name, "Eli Soetenga");
  assert.equal(conv.vehicle, "2019 Tundra 5.7L");
  assert.equal(conv.modelYear, "2019");
  assert.equal(conv.city, "Madison", "city rides from the chosen event");
});

test("a full event warns but never blocks (owner freedom)", async (t) => {
  if (!ok) return t.skip("no browser");
  const { page, posts } = await boot({ madisonFull: true });
  const dialogs = [];
  page.on("dialog", (d) => { dialogs.push(d.message()); d.accept(); });
  await page.selectOption('details[data-lead-id="L1"] [data-conv="event"]', { index: 1 });
  await page.waitForFunction(() =>
    document.querySelector('details[data-lead-id="L1"]').textContent.toLowerCase().includes("full"));
  await page.click('details[data-lead-id="L1"] [data-conv="go"]');
  await page.waitForFunction(() => document.body.textContent.includes("✓ Booked"));
  await page.close();
  assert.ok(dialogs.some((m) => /full/i.test(m)), "confirm dialog mentioned the full event: " + JSON.stringify(dialogs));
  assert.ok(posts.find((p) => p.action === "convert"), "convert still went through after confirm");
});
