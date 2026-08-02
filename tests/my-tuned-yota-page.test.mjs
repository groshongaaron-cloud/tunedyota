// Browser regression tests for the MY TUNED YOTA member logbook (site/my-tuned-yota.html).
// The page ships in the app bundle frozen at build time, so everything member- or
// price-shaped must arrive at runtime: vehicle + odometer + gauges + fluid sheet from
// /.netlify/functions/member-data, referral from client-certs, catalog for the guest
// path from /amsoil-garage.json. These tests boot the page against stubbed endpoints
// and assert each state renders (and that the offline cache carries a dead network).
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
    let p = decodeURIComponent(req.url.split("?")[0]); if (p === "/") p = "/my-tuned-yota.html";
    const f = path.join(SITE, p);
    if (!f.startsWith(SITE) || !fs.existsSync(f)) { res.writeHead(404); res.end("nf"); return; }
    const ext = path.extname(f);
    res.writeHead(200, { "Content-Type": ext === ".js" ? "text/javascript" : ext === ".html" ? "text/html" : ext === ".json" ? "application/json" : "application/octet-stream" });
    res.end(fs.readFileSync(f));
  });
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
  if (chromium) { try { browser = await chromium.launch(); browserOk = true; } catch { browserOk = false; } }
});

after(async () => { if (browser) await browser.close(); if (server) server.close(); });

const MEMBER = {
  status: "ok",
  vehicle: { vehicle: "Toyota Tundra", modelYear: "2021", engine: "5.7L V8", source: "booking" },
  calibration: { name: "Performance Calibration", date: "2026-04-17", recordId: "recCAL1" },
  odometer: { miles: 64180, date: "2026-07-28", source: "member" },
  gauges: [
    { system: "Engine Oil", product: "Signature Series 0W-20", stockNo: "ASMQT", intervalMiles: 10000, baselineMiles: 55000, milesLeft: 820, status: "warn" },
    { system: "Transmission", product: "Signature Series Multi-Vehicle ATF", stockNo: "ATLQT", intervalMiles: 60000, baselineMiles: 58000, milesLeft: 53820, status: "ok" },
  ],
  fluidSheet: [
    { system: "Engine Oil", product: "Signature Series 0W-20", stockNo: "ASMQT", capacity: 8.1, unit: "qt", verified: true, factoryInterval: "10,000 mi", tunedInterval: "10,000 mi" },
    { system: "Engine Oil Filter", product: "Oil Filter EA15K09", stockNo: "EA15K09", capacity: 1, unit: "ea", verified: true, factoryInterval: "10,000 mi", tunedInterval: "10,000 mi" },
    { system: "Transmission", product: "Signature Series Multi-Vehicle ATF", stockNo: "ATLQT", capacity: 3, unit: "qt", verified: true, factoryInterval: "severe service", tunedInterval: "60,000 mi" },
  ],
  garageUrl: "https://tunedyota.com/amsoil-garage?make=Toyota&model=Tundra&year=2021",
  orderUrl: "https://www.amsoil.com/shop/?zo=30713116",
};

// Boot the page with stubbed member endpoints. token=null boots a guest.
async function boot({ token, memberBody, failMember, localStorageExtra } = {}) {
  const posts = [];
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.route("**/.netlify/functions/member-data**", async (r) => {
    if (r.request().method() === "POST") {
      posts.push(JSON.parse(r.request().postData() || "{}"));
      return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "ok" }) });
    }
    if (failMember) return r.abort();
    return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(memberBody || MEMBER) });
  });
  await page.route("**/.netlify/functions/client-certs**", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "ok", certs: [], referralLink: "https://tunedyota.com/?ref=abc" }) }));
  await page.route("**/.netlify/functions/client-garage**", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "ok", vehicles: [] }) }));
  await page.addInitScript(({ token, extra }) => {
    if (token) localStorage.setItem("ty_client_token", token);
    for (const [k, v] of Object.entries(extra || {})) localStorage.setItem(k, v);
  }, { token: token || null, extra: localStorageExtra || {} });
  await page.goto(base + "/my-tuned-yota.html");
  await page.waitForLoadState("networkidle");
  return { page, ctx, posts };
}

test("guest: empty state, catalog-driven picker, fluid sheet with no prices", async (t) => {
  if (!browserOk) return t.skip("no browser");
  const { page, ctx } = await boot({});
  assert.ok(await page.isVisible("#clusterEmpty"), "empty cluster for a guest");
  assert.ok(await page.isVisible("#signinSec"), "sign-in card offered");

  // make -> model -> year cascade fed by the live catalog
  await page.selectOption("#make", "Toyota");
  await page.selectOption("#model", "Tundra");
  const years = await page.$$eval("#year option", (o) => o.map((x) => x.value).filter(Boolean));
  assert.ok(years.length > 5, "year list derived from catalog generations");
  await page.selectOption("#year", years[3]);
  await page.click("#addVehicle");

  assert.ok(await page.isVisible("#clusterFilled"), "cluster fills after setup");
  assert.match(await page.textContent("#rigName"), /Tundra/);
  assert.ok((await page.$$("#sheetRows tr")).length >= 5, "fluid sheet rows render");
  const body = await page.textContent("body");
  assert.ok(!/\$\d/.test(body), "no dollar amounts anywhere on the rendered page");
  await ctx.close();
});

test("member: server payload renders rig, odometer, gauges, record, sheet, referral", async (t) => {
  if (!browserOk) return t.skip("no browser");
  const { page, ctx } = await boot({ token: "tok1" });
  assert.ok(await page.isVisible("#clusterFilled"), "filled cluster");
  assert.equal((await page.textContent("#rigName")).trim(), "2021 Tundra");
  assert.match(await page.textContent("#rigSub"), /5\.7L V8/);
  assert.match(await page.textContent("#rigSub"), /Performance Calibration/);
  assert.equal((await page.textContent("#odoDigits")).replace(/\s/g, ""), "64180mi");
  assert.equal((await page.$$("#gauges .gauge")).length, 2, "one gauge per mile-based system");
  assert.match(await page.textContent("#gauges"), /820/);
  assert.match(await page.textContent("#gauges"), /53\.8k/);
  const dash = await page.getAttribute("#gauges .gauge:first-child .val", "stroke-dasharray");
  assert.ok(parseFloat(dash) > 60, "engine-oil arc nearly used up (820 of 10k left)");
  assert.ok(await page.isVisible("#recordSec"), "build record shown");
  assert.match(await page.textContent("#recordCal"), /Performance Calibration/);
  assert.equal((await page.$$("#sheetRows tr")).length, 3, "fluid sheet from member payload");
  assert.equal(await page.getAttribute("#sheetOrder", "href"), MEMBER.garageUrl);
  assert.ok(await page.isVisible("#referBox"), "referral link present");
  assert.ok(!(await page.isVisible("#signinSec")), "no sign-in card when signed in");
  await ctx.close();
});

test("member: update miles POSTs the odometer and refetches", async (t) => {
  if (!browserOk) return t.skip("no browser");
  const { page, ctx, posts } = await boot({ token: "tok1" });
  await page.click("#logMiles");
  await page.fill("#odoInput", "64500");
  await page.click("#odoSave");
  await page.waitForSelector("#logMiles");
  assert.deepEqual(posts, [{ odometer: 64500 }]);
  await ctx.close();
});

test("member offline: dead network renders the cached payload with a stale note", async (t) => {
  if (!browserOk) return t.skip("no browser");
  // Prime the cache exactly as a successful load would have written it.
  const cache = JSON.stringify({ at: "2026-08-01T12:00:00.000Z", catalog: null, member: MEMBER, referral: "" });
  const { page, ctx } = await boot({ token: "tok1", failMember: true, localStorageExtra: { ty_myty_cache: cache } });
  assert.ok(await page.isVisible("#clusterFilled"), "cached member payload still renders");
  assert.equal((await page.textContent("#rigName")).trim(), "2021 Tundra");
  assert.ok(await page.isVisible("#staleNote"), "stale note visible");
  assert.match(await page.textContent("#staleNote"), /2026-08-01/);
  await ctx.close();
});
