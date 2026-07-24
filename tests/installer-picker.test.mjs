// Browser regression tests for the one-record-at-a-time day view (2026-07-19 owner
// decision): inside an event card, a native <select> (the OS wheel on phones) lists
// the day's bookings grouped by status, plus "＋ Add a new booking…". Only the
// selected record renders — vertical stacks of close-out cards were unworkable on
// mobile at busy events. Runs in Chromium via Playwright; skips when no browser.
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

const today = (() => { const d = new Date(), p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; })();
const ROSTER = {
  admin: false, installer: "cody", events: [],
  bookings: [
    { id: "b1", city: "Fargo", dateISO: today, installer: "cody", slot: "9:20", slotLabel: "9:20 AM", name: "Bob", vehicle: "Tundra", phone: "2", email: "", status: "Booked" },
    { id: "b2", city: "Fargo", dateISO: today, installer: "cody", slot: "9:00", slotLabel: "9:00 AM", name: "Cara", vehicle: "Tacoma", phone: "3", email: "", status: "Booked" },
    { id: "b3", city: "Fargo", dateISO: today, installer: "cody", slot: "10:00", slotLabel: "10:00 AM", name: "Alice", vehicle: "4Runner", phone: "1", email: "", status: "Completed", calibration: "Medium", commission: 165 },
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
  await page.waitForFunction(() => !!document.querySelector(".bookingpick"));
  return page;
}

test("one record at a time: the picker lists all bookings, only ONE card renders", async (t) => {
  if (!browserOk) return t.skip("no browser available");
  const page = await boot();
  const state = await page.evaluate(() => {
    const evt = document.querySelector("#feed details.evt[data-key]");
    const sel = evt.querySelector("select.bookingpick");
    return {
      cards: evt.querySelectorAll(".card").length,
      options: Array.from(sel.options).map((o) => o.textContent),
      groups: Array.from(sel.querySelectorAll("optgroup")).map((g) => g.label),
      value: sel.value,
    };
  });
  assert.equal(state.cards, 1, "exactly one booking card visible");
  assert.equal(state.value, "b2", "defaults to the FIRST OPEN booking by slot order (9:00 Cara)");
  assert.ok(state.groups.some((l) => /Open \(2\)/.test(l)), "Open group with count");
  assert.ok(state.groups.some((l) => /Completed \(1\)/.test(l)), "Completed group with count");
  assert.ok(state.options.some((o) => /Add a new booking/.test(o)), "add-a-booking option present");
  await page.context().close();
});

test("changing the picker swaps the rendered record", async (t) => {
  if (!browserOk) return t.skip("no browser available");
  const page = await boot();
  await page.selectOption("select.bookingpick", "b1");
  await page.waitForFunction(() => document.querySelector("#feed details.evt[data-key] .card #vin_b1"));
  const cards = await page.evaluate(() => document.querySelectorAll("#feed details.evt[data-key] .card").length);
  assert.equal(cards, 1, "still only one card after switching");
  await page.context().close();
});

test("a completed record offers 'Next open job' to keep the flow moving", async (t) => {
  if (!browserOk) return t.skip("no browser available");
  const page = await boot();
  await page.selectOption("select.bookingpick", "b3");
  await page.waitForFunction(() => /Next open job/.test(document.querySelector("#feed details.evt[data-key]").textContent));
  await page.evaluate(() => Array.from(document.querySelectorAll("#feed details.evt[data-key] button")).find((b) => /Next open job/.test(b.textContent)).click());
  await page.waitForFunction(() => document.querySelector("select.bookingpick").value === "b2");
  await page.context().close();
});

test("the add-a-booking option reveals the walk-in form for that event", async (t) => {
  if (!browserOk) return t.skip("no browser available");
  const page = await boot();
  await page.selectOption("select.bookingpick", "__add__");
  // The adder now carries an editable Location/market prefilled with the event's
  // city (owner rule: location is visible + changeable on every booking form).
  await page.waitForFunction(() => Array.from(document.querySelectorAll("#feed details.evt button")).some((b) => /Add walk-in/.test(b.textContent)));
  const loc = await page.evaluate(() => {
    const i = Array.from(document.querySelectorAll("#feed input")).find((x) => /location \/ market/i.test(x.placeholder || ""));
    return i ? i.value : null;
  });
  if (loc !== "Fargo") throw new Error("Location input must prefill with the event city, got: " + loc);
  await page.context().close();
});
