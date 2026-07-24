// Browser regression test for the installer-console 📅 Week view + "never lose a
// booking" flows (site/installer.html): week calendar chips, chip→jump-to-card,
// and lead-convert landing on a highlighted Jobs card (the 218-caller fix).
// Skips cleanly if a browser can't launch (CI without browsers).
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

async function boot(opts = {}) {
  const bookings = opts.bookings || [];
  const leads = opts.leads || [];
  const page = await (await browser.newContext()).newPage();
  await page.route("**/sw.js", (r) => r.fulfill({ status: 200, contentType: "text/javascript", body: "/*x*/" }));
  await page.route("**/installer-roster**", (r) => r.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ bookings, events: [], admin: !!opts.admin, today }) }));
  await page.route("**/amsoil-metrics**", (r) => r.fulfill({ status: 200, body: "{}" }));
  await page.route("**/leads-list**", (r) => r.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ leads, admin: !!opts.admin, summary: {} }) }));
  if (opts.onLeadUpdate) await page.route("**/lead-update**", opts.onLeadUpdate);
  await page.addInitScript(() => localStorage.setItem("ty_installer_token", "t"));
  await page.goto(base + "/installer.html");
  await page.waitForFunction(() => !document.getElementById("app").classList.contains("hidden"));
  await page.waitForTimeout(150);
  return { page };
}

const bk = (over) => Object.assign({ id: "B1", city: "Omaha", dateISO: today, installer: "cody", slot: "", slotLabel: "",
  scheduledTime: "10:30 AM", name: "Ryan J", vehicle: "2016 Tundra", phone: "2185551234", email: "", mods: "",
  status: "Booked", isWalkin: false, calibration: "", vin: "", tuningPlatform: "", calibrationType: "",
  ecuId: "", gearSize: "", mileage: "" }, over);

test("Week tab shows this week's bookings as day chips — including a blank-city booking", async (t) => {
  if (!ok) return t.skip("no browser");
  const { page } = await boot({ bookings: [bk(), bk({ id: "B2", city: "", name: "Call-in 218", scheduledTime: "" })] });
  await page.click('.tabbtn[data-sub="week"]');
  await page.waitForTimeout(120);
  const txt = await page.evaluate(() => document.getElementById("feed").textContent);
  assert.match(txt, /Ryan J/);
  assert.match(txt, /Call-in 218/);
  assert.match(txt, /\(no city\)/);          // blank-city bookings are visible, labeled, never lost
  const chips = await page.evaluate(() => document.querySelectorAll("#feed .daychip:not(.evtchip)").length);
  assert.equal(chips, 2);
});

test("clicking a week chip jumps to the booking's card in Jobs and flashes it", async (t) => {
  if (!ok) return t.skip("no browser");
  const { page } = await boot({ bookings: [bk()] });
  await page.click('.tabbtn[data-sub="week"]');
  await page.waitForTimeout(120);
  await page.click("#feed .daychip:not(.evtchip)");
  await page.waitForTimeout(200);
  const state = await page.evaluate(() => ({
    tab: document.querySelector('.tabbtn.on[data-tab]') && document.querySelector('.tabbtn.on[data-tab]').getAttribute("data-tab"),
    flash: !!document.querySelector("#feed details.evt.flash"),
    open: !!document.querySelector('#feed details.evt[data-key="Omaha|' + new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" }) + '"][open]'),
    txt: document.getElementById("feed").textContent,
  }));
  assert.equal(state.tab, "jobs");
  assert.equal(state.flash, true, "the landed-in event card must flash");
  assert.match(state.txt, /Ryan J/);
});

test("converting a lead lands on the Jobs card, highlighted — never vanishes (218-caller fix)", async (t) => {
  if (!ok) return t.skip("no browser");
  const lead = { id: "L1", name: "Caller 218", vehicle: "", phone: "2185550000", email: "", city: "Bemidji",
    channel: "phone", stage: "New", installer: "cody", nextFollowup: "", lastContact: today, activity: "", convertedBooking: "" };
  const { page } = await boot({ leads: [lead],
    onLeadUpdate: async (r) => {
      const b = JSON.parse(r.request().postData() || "{}");
      assert.equal(b.action, "convert");
      assert.equal(b.city, "Bemidji");     // the console sends the editable city through
      await r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
        status: "ok", bookingId: "BK9", stage: "Booked",
        booking: bk({ id: "BK9", city: "Bemidji", name: "Caller 218", phone: "2185550000", scheduledTime: "" }) }) });
    } });
  await page.click('.tabbtn[data-tab="leads"]');
  await page.waitForTimeout(120);
  await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll("#feed details.evt"));
    const card = cards.find((d) => d.textContent.includes("Caller 218"));
    card.open = true; card.dispatchEvent(new Event("toggle"));
    const btn = Array.from(card.querySelectorAll("button")).find((b) => b.textContent === "Convert to booking");
    btn.click();
  });
  await page.waitForTimeout(250);
  const state = await page.evaluate(() => ({
    tab: document.querySelector('.tabbtn.on[data-tab]') && document.querySelector('.tabbtn.on[data-tab]').getAttribute("data-tab"),
    flash: !!document.querySelector("#feed details.evt.flash"),
    txt: document.getElementById("feed").textContent,
    msg: document.getElementById("msg").textContent,
  }));
  assert.equal(state.tab, "jobs", "convert must take the user to Jobs");
  assert.match(state.txt, /Bemidji/);
  assert.match(state.txt, /Caller 218/);
  assert.equal(state.flash, true, "the new booking's card must be highlighted");
  assert.match(state.msg, /✓ Booked Caller 218 — Bemidji/);
});

test("the everyday quick-add offers time + (admin) installer assignment", async (t) => {
  if (!ok) return t.skip("no browser");
  const { page } = await boot({ admin: true, bookings: [bk()] });
  await page.evaluate(() => {
    const det = document.getElementById("anydayform");
    det.open = true; det.dispatchEvent(new Event("toggle"));
  });
  const form = await page.evaluate(() => {
    const det = document.getElementById("anydayform");
    return {
      hasTime: !!Array.from(det.querySelectorAll("input")).find((i) => /time/i.test(i.placeholder || "")),
      instOptions: Array.from(det.querySelectorAll("select option")).map((o) => o.textContent),
    };
  });
  assert.equal(form.hasTime, true);
  assert.ok(form.instOptions.some((o) => /auto/i.test(o)), "auto routing stays the default");
  assert.ok(form.instOptions.some((o) => /Cody/.test(o)), "admin can direct-assign an installer");
});
