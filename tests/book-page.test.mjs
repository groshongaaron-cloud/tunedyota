// Browser tests for the /book/<slug> times-first mini flow. Stubs availability,
// vehicles.json, book, and track so no network/real booking happens.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.join(__dirname, "..", "site");
let chromium = null;
try { ({ chromium } = await import("playwright")); } catch {}
let server, base, browser, browserOk = false;

before(async () => {
  server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split("?")[0]);
    if (p.startsWith("/book/")) p = "/book.html";               // mirror the netlify.toml rewrite
    const f = path.join(SITE, p);
    if (!f.startsWith(SITE) || !fs.existsSync(f)) { res.writeHead(404); res.end("nf"); return; }
    const ext = path.extname(f);
    res.writeHead(200, { "Content-Type": ext === ".js" ? "text/javascript" : ext === ".html" ? "text/html" : ext === ".json" ? "application/json" : "text/plain" });
    res.end(fs.readFileSync(f));
  });
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
  if (chromium) { try { browser = await chromium.launch(); browserOk = true; } catch {} }
});
after(async () => { if (browser) await browser.close(); if (server) server.close(); });

const AVAIL = { city: "Fargo", hasEvent: true, capacity: 12, events: [
  { dateISO: "2099-08-09", eventLabel: "August 9, 2099", details: "", address: "", full: false,
    openSlots: ["9:00", "9:20"], takenSlots: [], slotLabels: { "9:00": "9:00 AM", "9:20": "9:20 AM" } }],
  eventDateISO: "2099-08-09", eventLabel: "August 9, 2099", openSlots: ["9:00", "9:20"], takenSlots: [], full: false,
  slotLabels: { "9:00": "9:00 AM", "9:20": "9:20 AM" } };

async function boot(slug, avail = AVAIL) {
  const booked = [];
  const page = await (await browser.newContext()).newPage();
  await page.route("**/availability**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(avail) }));
  await page.route("**/functions/track", (r) => r.fulfill({ status: 204, body: "" }));
  await page.route("**/functions/book", async (r) => {
    booked.push(JSON.parse(r.request().postData() || "{}"));
    return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "booked", eventLabel: avail.eventLabel, slot: booked[0].slot }) });
  });
  await page.goto(base + "/book/" + slug);
  return { page, booked };
}

test("event page shows the event header and open time slots", async (t) => {
  if (!browserOk) return t.skip("no browser");
  const { page } = await boot("fargo-2099-08-09");
  await page.waitForSelector("#slots button");
  const txt = await page.evaluate(() => document.body.textContent);
  assert.match(txt, /Fargo/);
  assert.match(txt, /August 9, 2099/);
  assert.match(txt, /9:00 AM/);
  await page.close();
});

test("tap a time → form → confirm books through /book with Source event-link", async (t) => {
  if (!browserOk) return t.skip("no browser");
  const { page, booked } = await boot("fargo-2099-08-09");
  await page.waitForSelector("#slots button");
  await page.click('#slots button[data-slot="9:20"]');
  await page.fill("#bkName", "Jo Test");
  await page.fill("#bkPhone", "6125550100");
  await page.fill("#bkEmail", "jo@x.com");
  await page.selectOption("#bkMake", "Toyota");
  await page.selectOption("#bkModel", "Tundra");
  await page.waitForSelector("#bkConfig option:nth-child(2)", { state: "attached" });
  await page.selectOption("#bkConfig", { index: 1 });
  await page.click("#bkSubmit");
  await page.waitForSelector("#done", { state: "visible" });
  assert.equal(booked.length, 1);
  assert.equal(booked[0].city, "Fargo");
  assert.equal(booked[0].dateISO, "2099-08-09");
  assert.equal(booked[0].slot, "9:20");
  assert.equal(booked[0].source, "event-link");
  assert.ok(booked[0].vehicle.includes("Tundra"));
  await page.close();
});

test("unknown/passed event shows the fallback with funnel + waitlist paths, no dead end", async (t) => {
  if (!browserOk) return t.skip("no browser");
  const { page } = await boot("fargo-2000-01-01", { city: "Fargo", hasEvent: true, events: [AVAIL.events[0]] });
  await page.waitForSelector("#fallback", { state: "visible" });
  const txt = await page.evaluate(() => document.getElementById("fallback").textContent);
  assert.match(txt, /passed|isn't scheduled/i);
  assert.match(txt, /August 9, 2099/, "offers the next Fargo event");
  const hasFunnelLink = await page.evaluate(() => !!document.querySelector('#fallback a[href*="find-your-exact-tune"]'));
  assert.ok(hasFunnelLink, "waitlist/funnel path present");
  await page.close();
});

test("price appears once a vehicle config is chosen", async (t) => {
  if (!browserOk) return t.skip("no browser");
  const { page } = await boot("fargo-2099-08-09");
  await page.waitForSelector("#slots button");
  await page.click('#slots button[data-slot="9:00"]');
  await page.selectOption("#bkMake", "Toyota");
  await page.selectOption("#bkModel", "Tundra");
  await page.waitForSelector("#bkConfig option:nth-child(2)", { state: "attached" });
  await page.selectOption("#bkConfig", { index: 1 });
  const price = await page.evaluate(() => document.getElementById("bkPrice").textContent);
  assert.match(price, /\$\d+/, "starting price shown before confirming");
  await page.close();
});
