// Browser regression tests: chat assignment control (owner ask 2026-07-24) and the
// per-event walk-in adder's editable Location/market field. Skips without a browser.
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

const bk = { id: "B1", city: "Omaha", dateISO: today, installer: "cody", slot: "", slotLabel: "",
  scheduledTime: "", name: "Ryan J", vehicle: "Tundra", phone: "5551", email: "", mods: "", status: "Booked",
  isWalkin: false, calibration: "", vin: "", tuningPlatform: "", calibrationType: "", ecuId: "", gearSize: "", mileage: "" };

async function boot(opts = {}) {
  const chatPosts = [];
  const page = await (await browser.newContext()).newPage();
  await page.route("**/sw.js", (r) => r.fulfill({ status: 200, contentType: "text/javascript", body: "/*x*/" }));
  await page.route("**/installer-roster**", (r) => r.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ bookings: [bk], events: [], admin: !!opts.admin, today, installer: opts.me || "aaron" }) }));
  await page.route("**/amsoil-metrics**", (r) => r.fulfill({ status: 200, body: "{}" }));
  await page.route("**/leads-list**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ leads: [], admin: !!opts.admin, summary: {} }) }));
  await page.route("**/functions/chat", async (r) => {
    const b = JSON.parse(r.request().postData() || "{}");
    chatPosts.push(b);
    if (b.op === "list") return r.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ sessions: [{ id: "fb:1", customerName: "Pat Q", phone: "", vehicle: "LC250", city: "Duluth", installer: "", lastActivity: "", turnCount: 1, lastRole: "user", lastText: "hi" }] }) });
    if (b.op === "transcript") return r.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ id: "fb:1", status: "escalated", customerName: "Pat Q", phone: "", vehicle: "LC250", city: "Duluth", installer: b.__assigned || "", turns: [{ role: "user", text: "hi", at: 1 }] }) });
    if (b.op === "assign") return r.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ status: "ok", installer: b.installer }) });
    return r.fulfill({ status: 400, contentType: "application/json", body: "{}" });
  });
  await page.addInitScript(() => localStorage.setItem("ty_installer_token", "t"));
  await page.goto(base + "/installer.html");
  await page.waitForFunction(() => !document.getElementById("app").classList.contains("hidden"));
  await page.waitForTimeout(150);
  return { page, chatPosts };
}

test("admin chat thread has an Assign dropdown that POSTs op:assign", async (t) => {
  if (!ok) return t.skip("no browser");
  const { page, chatPosts } = await boot({ admin: true });
  await page.click('.tabbtn[data-tab="chats"]');
  await page.waitForTimeout(200);
  await page.click(".crow[data-chat]");
  await page.waitForTimeout(250);
  const hasSel = await page.evaluate(() => !!document.getElementById("chatassign"));
  assert.equal(hasSel, true, "admin sees the assign dropdown");
  await page.selectOption("#chatassign", "cody");
  await page.waitForTimeout(250);
  const assign = chatPosts.find((p) => p.op === "assign");
  assert.ok(assign, "op:assign must be POSTed");
  assert.equal(assign.session, "fb:1");
  assert.equal(assign.installer, "cody");
  const msg = await page.evaluate(() => document.getElementById("msg").textContent);
  assert.match(msg, /assigned to Cody/i);
});

test("admin chat list marks unassigned threads", async (t) => {
  if (!ok) return t.skip("no browser");
  const { page } = await boot({ admin: true });
  await page.click('.tabbtn[data-tab="chats"]');
  await page.waitForTimeout(200);
  const txt = await page.evaluate(() => document.getElementById("feed").textContent);
  assert.match(txt, /unassigned/i);
});

test("per-event walk-in adder shows an editable Location/market prefilled with the event city", async (t) => {
  if (!ok) return t.skip("no browser");
  const { page } = await boot({ admin: false, me: "cody" });
  await page.waitForTimeout(150);
  const loc = await page.evaluate(() => {
    const sel = document.querySelector("select.bookingpick");
    if (!sel) return { err: "no picker" };
    sel.value = "__add__"; sel.dispatchEvent(new Event("change", { bubbles: true }));
    const inputs = Array.from(document.querySelectorAll("#feed input"));
    const lc = inputs.find((i) => /location \/ market/i.test(i.placeholder || ""));
    return lc ? { value: lc.value, editable: !lc.readOnly } : { err: "no location input" };
  });
  assert.equal(loc.err, undefined, loc.err);
  assert.equal(loc.value, "Omaha");
  assert.equal(loc.editable, true);
});
