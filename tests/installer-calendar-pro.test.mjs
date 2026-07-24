// Browser regression tests for calendar phase 2 (site/installer.html):
// Month view with booking density, lead follow-ups as calendar chips, and
// drag-to-reschedule between day cells. Skips cleanly without a browser.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.join(__dirname, "..", "site");
let chromium = null; try { ({ chromium } = await import("playwright")); } catch {}
let server, base, browser, ok = false;

const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
function addDaysISO(iso, n) { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n);
  const p = (x) => String(x).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; }
// A drop target inside the SAME week as today: tomorrow, unless that crosses into
// the next week (today = Sunday), in which case use yesterday.
const sameWeekOther = (new Date(today + "T00:00:00").getDay() === 0) ? addDaysISO(today, -1) : addDaysISO(today, 1);

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
  const page = await (await browser.newContext()).newPage();
  await page.route("**/sw.js", (r) => r.fulfill({ status: 200, contentType: "text/javascript", body: "/*x*/" }));
  await page.route("**/installer-roster**", (r) => r.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ bookings: opts.bookings || [], events: [], admin: !!opts.admin, today }) }));
  await page.route("**/amsoil-metrics**", (r) => r.fulfill({ status: 200, body: "{}" }));
  await page.route("**/leads-list**", (r) => r.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ leads: opts.leads || [], admin: !!opts.admin, summary: {} }) }));
  if (opts.onReschedule) await page.route("**/installer-reschedule**", opts.onReschedule);
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

test("Month view: density per day, today outlined, day tap returns to that week", async (t) => {
  if (!ok) return t.skip("no browser");
  const { page } = await boot({ bookings: [bk(), bk({ id: "B2", name: "Second", scheduledTime: "11:00 AM" }),
    bk({ id: "B3", name: "Done guy", status: "Completed" })] });
  await page.click('.tabbtn[data-sub="week"]');
  await page.waitForTimeout(120);
  await page.click("#feed .calmode");             // Week ⇄ Month toggle
  await page.waitForTimeout(120);
  const m = await page.evaluate((td) => {
    const cell = document.querySelector('#feed .mcell[data-date="' + td + '"]');
    return { cells: document.querySelectorAll("#feed .mcell").length,
      todayCell: !!cell, isToday: cell && cell.classList.contains("isToday"),
      density: cell ? cell.textContent : "" };
  }, today);
  assert.ok(m.cells >= 28, "a month grid renders");
  assert.equal(m.isToday, true);
  assert.match(m.density, /2/);                    // 2 open
  assert.match(m.density, /1/);                    // 1 done
  await page.click('#feed .mcell[data-date="' + today + '"]');
  await page.waitForTimeout(120);
  const wk = await page.evaluate(() => ({ chips: document.querySelectorAll("#feed .daychip:not(.evtchip)").length,
    grid: !!document.querySelector("#feed .weekgrid") }));
  assert.equal(wk.grid, true, "tapping a month day returns to the week view");
  assert.equal(wk.chips, 3);
});

test("a lead with a follow-up date shows on the calendar; tapping it opens that lead", async (t) => {
  if (!ok) return t.skip("no browser");
  const lead = { id: "L7", name: "Maybe Mike", vehicle: "4Runner", phone: "6125550000", email: "", city: "Twin Cities",
    channel: "sms", stage: "Following up", installer: "cody", nextFollowup: today, lastContact: today, activity: "", convertedBooking: "" };
  const { page } = await boot({ leads: [lead] });
  await page.click('.tabbtn[data-sub="week"]');
  await page.waitForTimeout(300);                  // week view lazy-loads leads, then re-renders
  const chipTxt = await page.evaluate(() => {
    const c = document.querySelector("#feed .daychip.leadchip");
    return c ? c.textContent : "";
  });
  assert.match(chipTxt, /Maybe Mike/);
  assert.match(chipTxt, /Follow up/i);
  await page.click("#feed .daychip.leadchip");
  await page.waitForTimeout(200);
  const state = await page.evaluate(() => ({
    tab: document.querySelector('.tabbtn.on[data-tab]') && document.querySelector('.tabbtn.on[data-tab]').getAttribute("data-tab"),
    openCard: (() => { const d = Array.from(document.querySelectorAll("#feed details.evt"))
      .find((x) => x.textContent.includes("Maybe Mike")); return !!(d && d.open); })(),
  }));
  assert.equal(state.tab, "leads");
  assert.equal(state.openCard, true, "the tapped lead's card opens");
});

test("dragging a booking chip to another day reschedules it (POST + chip moves + flash)", async (t) => {
  if (!ok) return t.skip("no browser");
  let posted = null;
  const { page } = await boot({ bookings: [bk()], onReschedule: async (r) => {
    posted = JSON.parse(r.request().postData() || "{}");
    await r.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ status: "ok", dateISO: posted.dateISO, time: "10:30 AM" }) });
  } });
  await page.click('.tabbtn[data-sub="week"]');
  await page.waitForTimeout(120);
  await page.evaluate((target) => {
    const chip = document.querySelector('#feed .daychip[draggable="true"]');
    const cell = document.querySelector('#feed .daycell[data-date="' + target + '"]');
    const dt = new DataTransfer();
    chip.dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer: dt }));
    cell.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: dt }));
    cell.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer: dt }));
  }, sameWeekOther);
  await page.waitForFunction(() => /moved/i.test(document.getElementById("msg").textContent), null, { timeout: 3000 });
  assert.ok(posted, "installer-reschedule must be called");
  assert.equal(posted.recordId, "B1");
  assert.equal(posted.dateISO, sameWeekOther);
  const after2 = await page.evaluate((target) => ({
    inTarget: !!document.querySelector('#feed .daycell[data-date="' + target + '"] .daychip:not(.evtchip)'),
    flash: !!document.querySelector('#feed .daycell.flash, #feed .daycell .daychip.flash'),
  }), sameWeekOther);
  assert.equal(after2.inTarget, true, "the chip renders on its new day");
});

test("a Completed booking's chip is not draggable", async (t) => {
  if (!ok) return t.skip("no browser");
  const { page } = await boot({ bookings: [bk({ status: "Completed" })] });
  await page.click('.tabbtn[data-sub="week"]');
  await page.waitForTimeout(120);
  const draggable = await page.evaluate(() => {
    const c = document.querySelector("#feed .daychip:not(.evtchip)");
    return c ? c.getAttribute("draggable") : null;
  });
  assert.notEqual(draggable, "true");
});
