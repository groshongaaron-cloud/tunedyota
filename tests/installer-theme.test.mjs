// Browser regression tests for the switchable theme layouts (Night Shift / Field Day /
// Heritage Garage). The switcher must apply data-theme instantly, POST the choice to
// installer-prefs, and the server-side preference must win on the next boot so the
// layout follows the installer across devices. The themed summary binds REAL roster
// numbers (est. payout from resolved commissions), never the mockup's demo data.
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

// One completed tune THIS month with a server-resolved commission (as the live roster
// sends) + one open job today. The summary must show $165, not the mockup's $1,010.
const today = (() => { const d = new Date(), p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; })();
const ROSTER = {
  admin: false, installer: "cody", events: [],
  bookings: [
    { id: "r1", city: "Fargo", dateISO: today, installer: "cody", name: "Alice", vehicle: "Tacoma", phone: "1", email: "", status: "Completed", commission: 165 },
    { id: "r2", city: "Fargo", dateISO: today, installer: "cody", name: "Bob", vehicle: "Tundra", phone: "2", email: "", status: "Booked" },
  ],
};

async function boot({ serverTheme = "", localTheme = null, onPost = () => {} } = {}) {
  const page = await (await browser.newContext()).newPage();
  await page.route("**/sw.js", (r) => r.fulfill({ status: 200, contentType: "text/javascript", body: "/*noop*/" }));
  await page.route("**/installer-roster**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ROSTER) }));
  await page.route("**/installer-prefs**", (r) => {
    if (r.request().method() === "POST") { onPost(JSON.parse(r.request().postData() || "{}")); r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "ok", theme: JSON.parse(r.request().postData() || "{}").theme }) }); }
    else r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "ok", theme: serverTheme }) });
  });
  await page.addInitScript(({ localTheme }) => {
    localStorage.setItem("ty_installer_token", "t");
    if (localTheme) localStorage.setItem("ty_theme", localTheme);
  }, { localTheme });
  await page.goto(base + "/installer.html");
  await page.waitForFunction(() => !document.getElementById("app").classList.contains("hidden"));
  await page.waitForFunction(() => !!document.querySelector("#subtabs .tabbtn"));
  return page;
}

test("default layout is heritage; summary binds real roster numbers", async (t) => {
  if (!browserOk) return t.skip("no browser available");
  const page = await boot();
  assert.equal(await page.evaluate(() => document.body.getAttribute("data-theme")), "heritage");
  const summary = await page.evaluate(() => document.getElementById("summary").textContent);
  assert.match(summary, /\$165/, "est. payout comes from the roster's resolved commissions");
  assert.match(summary, /1 done · 1 open/, "month tally from real bookings");
  assert.ok(!summary.includes("$1,010"), "no mockup demo data");
  await page.context().close();
});

test("the 🎨 sheet switches the layout and persists it to the installer's profile", async (t) => {
  if (!browserOk) return t.skip("no browser available");
  let posted = null;
  const page = await boot({ onPost: (b) => { posted = b; } });
  await page.evaluate(() => document.getElementById("themelink").click());
  await page.waitForFunction(() => document.getElementById("sheet").classList.contains("open"));
  await page.evaluate(() => document.querySelector('.theme-opt[data-theme="field"]').click());
  await page.waitForFunction(() => document.body.getAttribute("data-theme") === "field");
  await page.waitForFunction(() => !document.getElementById("sheet").classList.contains("open"));
  assert.deepEqual(posted, { theme: "field" }, "choice POSTed to installer-prefs");
  assert.equal(await page.evaluate(() => localStorage.getItem("ty_theme")), "field");
  const summary = await page.evaluate(() => document.getElementById("summary").textContent);
  assert.match(summary, /closed out|no jobs/, "Field Day meter rendered");
  await page.context().close();
});

test("the server-side preference wins over this device's cached theme", async (t) => {
  if (!browserOk) return t.skip("no browser available");
  const page = await boot({ serverTheme: "night", localTheme: "field" });
  await page.waitForFunction(() => document.body.getAttribute("data-theme") === "night");
  assert.equal(await page.evaluate(() => localStorage.getItem("ty_theme")), "night", "cache updated to follow the profile");
  await page.context().close();
});

test("bottom bar opens the any-day walk-in form", async (t) => {
  if (!browserOk) return t.skip("no browser available");
  const page = await boot();
  await page.evaluate(() => document.getElementById("bbwalk").click());
  await page.waitForFunction(() => { const d = document.getElementById("anydayform"); return d && d.open; });
  await page.context().close();
});
