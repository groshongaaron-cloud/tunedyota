// Browser boot guard for the two big inline-script SPAs — site/installer.html
// (the installer console) and site/app.html (the client app shell). Each must
// load in a real browser and actually INITIALIZE. This is the guard that catches
// a syntax break in the inline <script> (e.g. an editor smart-quoting string
// delimiters ' -> ') that white-screens the page — the unit tests never load the
// HTML, so only a real boot catches it. Skips cleanly where a browser can't
// launch (CI without browsers), matching the other .mjs browser tests.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.join(__dirname, "..", "site");
let chromium = null; try { ({ chromium } = await import("playwright")); } catch {}
let server, base, browser, ok = false;
const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });

before(async () => {
  server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split("?")[0]); if (p === "/") p = "/index.html";
    const f = path.join(SITE, p);
    if (!f.startsWith(SITE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end("nf"); return; }
    const ext = path.extname(f);
    res.writeHead(200, { "Content-Type": ext === ".js" ? "text/javascript" : ext === ".html" ? "text/html" : ext === ".json" ? "application/json" : "text/plain" });
    res.end(fs.readFileSync(f));
  });
  await new Promise((r) => server.listen(0, r)); base = `http://127.0.0.1:${server.address().port}`;
  if (chromium) { try { browser = await chromium.launch(); ok = true; } catch { ok = false; } }
});
after(async () => { if (browser) await browser.close(); if (server) server.close(); });

// A page that records uncaught JS exceptions (pageerror). Resource 404s / network
// failures surface as console errors, not pageerror, so this stays robust while
// still failing hard on a real script exception.
async function newPage() {
  const page = await (await browser.newContext()).newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  await page.route("**/sw.js", (r) => r.fulfill({ status: 200, contentType: "text/javascript", body: "/*x*/" }));
  return { page, pageErrors };
}

// waitForFunction that turns a boot timeout into a clear failure (a script that
// fails to parse/run never satisfies the boot condition).
async function bootOrFail(page, fn, label, pageErrors) {
  try { await page.waitForFunction(fn, null, { timeout: 20000 }); }
  catch {
    assert.fail(`${label} did not boot within 20s` + (pageErrors.length ? ` — JS errors: ${pageErrors.join(" | ")}` : " (no pageerror — likely a parse error in the inline script)"));
  }
}

test("installer console (site/installer.html) boots with no JS errors", async (t) => {
  if (!ok) return t.skip("no browser");
  const { page, pageErrors } = await newPage();
  await page.route("**/installer-roster**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ bookings: [], events: [], admin: false, today }) }));
  await page.route("**/amsoil-metrics**", (r) => r.fulfill({ status: 200, body: "{}" }));
  await page.route("**/leads-list**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ leads: [], admin: false, summary: {} }) }));
  await page.addInitScript(() => localStorage.setItem("ty_installer_token", "t"));
  await page.goto(base + "/installer.html");
  await bootOrFail(page, () => { const a = document.getElementById("app"); return !!a && !a.classList.contains("hidden"); }, "installer.html", pageErrors);
  assert.deepEqual(pageErrors, [], "installer.html threw during boot");
  await page.close();
});

test("client app shell (site/app.html) boots and wires the purchase flow", async (t) => {
  if (!ok) return t.skip("no browser");
  const { page, pageErrors } = await newPage();
  await page.route("**/amsoil-garage.json", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await page.route("**/.netlify/functions/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await page.goto(base + "/app.html");
  await bootOrFail(page, () => !!window.TYPayment && !!window.MAGNUSON_CATALOG && !!document.getElementById("tabbar"), "app.html", pageErrors);
  assert.equal(await page.evaluate(() => typeof (window.TYPayment && window.TYPayment.reportApproval)), "function");

  // The shop view must render Buy buttons (purchase UI booted).
  await page.evaluate(() => { location.hash = "#shop/magnuson"; });
  await bootOrFail(page, () => document.querySelectorAll("[data-buy]").length > 0, "app.html shop view", pageErrors);
  const sku = await page.evaluate(() => document.querySelector("[data-buy]").getAttribute("data-buy"));
  assert.ok(sku, "shop must render at least one Buy button");

  // The go-live wiring: clicking Buy -> onApproval -> reportApproval(sku, r).
  await page.evaluate(() => {
    window.__reported = [];
    window.TYPayment.reportApproval = (s, r) => { window.__reported.push({ sku: s, r }); return Promise.resolve({ status: "ok" }); };
    window.TYPayment.startCheckout = (s, h) => { if (h && h.onApproval) h.onApproval({ sessionId: "s", transaction: { id: "txn_boot", isAuthorized: true }, authorized: true }); return Promise.resolve({ status: "ok" }); };
  });
  await page.click("[data-buy]");
  await page.waitForFunction(() => (window.__reported || []).length === 1, null, { timeout: 5000 });
  const reported = await page.evaluate(() => window.__reported[0]);
  assert.equal(reported.sku, sku, "onApproval must report the clicked SKU");
  assert.equal(reported.r.transaction.id, "txn_boot", "onApproval must pass the approval payload through");
  assert.deepEqual(pageErrors, [], "app.html threw during boot / purchase flow");
  await page.close();
});
