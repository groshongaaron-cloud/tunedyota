// Browser regression tests: the Jobs search box must honor the active city sub-tab
// (2026-07-16 owner decision). Previously, searching while on a city tab silently
// searched ALL cities — matches from other markets appeared under a highlighted
// city tab. Scoped mode also offers an explicit "search all markets ›" escape hatch.
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

// Two open bookings in two different markets: Alice/Tacoma in Fargo, Bob/Tundra in Omaha.
const ROSTER = {
  admin: false,
  events: [],
  bookings: [
    { id: "r1", city: "Fargo", dateISO: "2026-07-10", installer: "cody", name: "Alice", vehicle: "Tacoma", phone: "1", email: "", status: "Booked" },
    { id: "r2", city: "Omaha", dateISO: "2026-07-10", installer: "cody", name: "Bob", vehicle: "Tundra", phone: "2", email: "", status: "Booked" },
  ],
};

async function boot() {
  const page = await (await browser.newContext()).newPage();
  await page.route("**/sw.js", (r) => r.fulfill({ status: 200, contentType: "text/javascript", body: "/*noop*/" }));
  await page.route("**/installer-roster**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ROSTER) }));
  await page.route("**/amsoil-metrics**", (r) => r.fulfill({ status: 200, body: "{}" }));
  await page.addInitScript(() => localStorage.setItem("ty_installer_token", "t"));
  await page.goto(base + "/installer.html");
  await page.waitForFunction(() => !document.getElementById("app").classList.contains("hidden"));
  await page.waitForFunction(() => !!document.querySelector("#subtabs .tabbtn"));
  return page;
}

const clickTab = (page, id) => page.evaluate((id) => document.querySelector('#subtabs .tabbtn[data-sub="' + id + '"]').click(), id);
const search = async (page, q) => {
  await page.evaluate((q) => { const el = document.getElementById("q"); el.value = q; el.dispatchEvent(new Event("input")); }, q);
  await page.waitForTimeout(60);
};
const feedText = (page) => page.evaluate(() => document.getElementById("feed").textContent);

test("searching on a city tab only matches that city's bookings", async (t) => {
  if (!browserOk) return t.skip("no browser available");
  const page = await boot();
  await clickTab(page, "Fargo");
  await search(page, "tundra"); // Bob's vehicle — but Bob is in Omaha
  const txt = await feedText(page);
  assert.ok(!/Bob/.test(txt), "Omaha booking must NOT appear while the Fargo tab is active");
  assert.match(txt, /Search results \(0\)/, "scoped search should report zero matches");
  await search(page, "tacoma"); // Alice, in Fargo — should match
  const txt2 = await feedText(page);
  assert.ok(/Alice/.test(txt2), "Fargo booking should match a scoped search");
  await page.close();
});

test("scoped search offers a 'search all markets' escape hatch that broadens to All", async (t) => {
  if (!browserOk) return t.skip("no browser available");
  const page = await boot();
  await clickTab(page, "Fargo");
  await search(page, "tundra");
  const hasLink = await page.evaluate(() => !!document.getElementById("qall"));
  assert.ok(hasLink, "scoped search should show a 'search all markets ›' link");
  await page.evaluate(() => document.getElementById("qall").click());
  await page.waitForTimeout(60);
  const txt = await feedText(page);
  assert.ok(/Bob/.test(txt), "after broadening, the Omaha match should appear");
  const onAll = await page.evaluate(() => document.querySelector('#subtabs .tabbtn[data-sub="all"]').classList.contains("on"));
  assert.ok(onAll, "broadening should switch the active tab to All");
  await page.close();
});

test("searching on the All tab still searches every market", async (t) => {
  if (!browserOk) return t.skip("no browser available");
  const page = await boot();
  await search(page, "t"); // matches Tacoma + Tundra
  const txt = await feedText(page);
  assert.ok(/Alice/.test(txt) && /Bob/.test(txt), "All-tab search should span all cities");
  await page.close();
});
