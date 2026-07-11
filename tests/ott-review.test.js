const { test } = require("node:test");
const assert = require("node:assert/strict");
const { review, saveOverrides, completeBooking, addWalkin, reviewPageHtml, OVERRIDE_FIELD } = require("../netlify/functions/ott-report-review.js");

const env = { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b", OTT_APPROVE_SECRET: "sec", SITE_URL: "https://tunedyota.com" };
const completed = (extra = {}) => ({
  id: "recABCDE12345", Name: "Jane", Vehicle: "2015 Toyota Tundra 5.7L V8", VIN: "5TFDW5F17MX000000",
  "OTT Calibration": "Spicy", "Calibration Date": "2026-06-15", Installer: ["cody"], Status: "Completed",
  "Tuning Platform": "PCM", "Calibration Type": "Basic", ...extra,
});
const overdue = (extra = {}) => ({ id: "recOPEN1", Name: "Olga", Vehicle: "2015 Tundra 5.7L V8 · More power",
  City: "Omaha", "Event Date": "2026-06-28", Status: "Booked", Installer: ["cody"], ...extra });
const recs = (rows) => rows.map((f) => ({ id: f.id || "rec1", fields: f }));
const NOW = new Date("2026-07-10T12:00:00Z");

test("a bad/missing token is rejected (401) for both GET and POST", async () => {
  const g = await review({ month: "2026-06", token: "nope" }, { env, listAll: async () => [] });
  assert.equal(g.code, 401);
  const p = await saveOverrides({ month: "2026-06", token: "nope", overrides: {} }, { env });
  assert.equal(p.code, 401);
});

test("GET returns completed rows + overdue open rows for the month", async () => {
  const out = await review({ month: "2026-06", token: "sec" },
    { env, now: NOW, listAll: async () => recs([completed(), overdue()]) });
  assert.equal(out.status, "page");
  assert.equal(out.subRows.length, 1);
  assert.equal(out.openRows.length, 1);
  assert.equal(out.openRows[0].customer, "Olga");
});

test("the page has an editable commission input per row, a download link, a send link, and the overdue section", () => {
  return review({ month: "2026-06", token: "sec" }, { env, now: NOW, listAll: async () => recs([completed(), overdue()]) })
    .then((r) => {
      const html = reviewPageHtml(r.subRows, r.openRows, r.month, env);
      assert.match(html, /OTT Commission Report — June 2026/);
      assert.ok(html.includes('input class="comm'), "editable commission input present");
      assert.ok(html.includes('data-rec="recABCDE12345"'), "input is keyed to the record for saving");
      assert.ok(html.includes("format=xlsx"), "Download Excel link");
      assert.ok(html.includes("ott-report-send?month=2026-06"), "Send to OTT link");
      assert.match(html, /Overdue \/ incomplete bookings/);
      assert.ok(html.includes("Olga"), "overdue booking listed");
    });
});

test("format=xlsx returns the workbook as a Buffer", async () => {
  const out = await review({ month: "2026-06", token: "sec", format: "xlsx" },
    { env, now: NOW, listAll: async () => recs([completed()]) });
  assert.equal(out.status, "xlsx");
  assert.ok(Buffer.isBuffer(out.buffer) && out.buffer.slice(0, 2).toString() === "PK");
});

test("POST saves numeric overrides (and clears with null), writing to Airtable", async () => {
  const writes = [];
  const out = await saveOverrides({ month: "2026-06", token: "sec", overrides: { recA: 275, recB: "", recC: 0 } },
    { env, update: async (a) => { writes.push({ id: a.id, fields: a.fields }); return {}; } });
  assert.equal(out.ok, true);
  assert.equal(out.saved, 3);
  assert.deepEqual(writes.find((w) => w.id === "recA").fields, { [OVERRIDE_FIELD]: 275 });
  assert.deepEqual(writes.find((w) => w.id === "recB").fields, { [OVERRIDE_FIELD]: null }, "blank clears the override");
  assert.deepEqual(writes.find((w) => w.id === "recC").fields, { [OVERRIDE_FIELD]: 0 }, "zero is a real value");
});

test("POST reports a not-yet-added column so the owner can create it", async () => {
  const out = await saveOverrides({ month: "2026-06", token: "sec", overrides: { recA: 275 } },
    { env, log: { error() {} }, update: async () => { throw new Error(`Unknown field name: "${OVERRIDE_FIELD}"`); } });
  assert.equal(out.error, "missing-column");
  assert.equal(out.code, 200);
});

test("completeBooking closes out ANY installer's booking with the OTT fields (owner-authorized)", async () => {
  let wrote = null;
  const out = await completeBooking({ token: "sec", booking: {
    recordId: "recOPEN1", eventDate: "2026-06-28", calibration: "Medium",
    tuningPlatform: "vft", calibrationType: "9.2 New", commission: 110, vin: "3tmcz5an0mm417034",
    ecuId: "cm5201", gearSize: "4.30", mileage: "51,481",
  } }, { env, update: async (a) => { wrote = a.fields; return {}; } });
  assert.equal(out.ok, true);
  assert.equal(wrote.Status, "Completed");
  assert.equal(wrote["OTT Calibration"], "Medium");
  assert.equal(wrote["Calibration Date"], "2026-06-28", "reports under the event month");
  assert.equal(wrote["Tuning Platform"], "VFT");
  assert.equal(wrote["Calibration Type"], "9.2 New");
  assert.equal(wrote[OVERRIDE_FIELD], 110);
  assert.equal(wrote.VIN, "3TMCZ5AN0MM417034");
  assert.equal(wrote.Mileage, 51481, "commas stripped");
});

test("completeBooking rejects a bad calibration and a bad token", async () => {
  const bad = await completeBooking({ token: "sec", booking: { recordId: "r1", calibration: "Nope" } }, { env, update: async () => ({}) });
  assert.equal(bad.error, "bad-calibration");
  const un = await completeBooking({ token: "x", booking: { recordId: "r1", calibration: "Medium" } }, { env, update: async () => ({}) });
  assert.equal(un.code, 401);
});

test("addWalkin creates a completed walk-in record for the report", async () => {
  let created = null;
  const out = await addWalkin({ token: "sec", booking: {
    name: "Walk Inn", vehicle: "2021 Toyota Tacoma 2.7L", city: "Omaha", dateISO: "2026-06-28",
    installer: "cody", calibration: "Light and Mild", tuningPlatform: "VFT", calibrationType: "9.2 New", commission: 110,
  } }, { env, create: async (a) => { created = a.fields; return { id: "recNEW" }; } });
  assert.equal(out.ok, true);
  assert.equal(out.created, "recNEW");
  assert.equal(created.Name, "Walk Inn");
  assert.equal(created.Status, "Completed");
  assert.equal(created["Calibration Date"], "2026-06-28");
  assert.equal(created["OTT Calibration"], "Light and Mild");
  assert.equal(created.Installer, "cody");
  assert.equal(created.Source, "owner:walk-in");
  assert.equal(created[OVERRIDE_FIELD], 110);
});

test("addWalkin requires a name and a valid calibration", async () => {
  const noName = await addWalkin({ token: "sec", booking: { calibration: "Medium" } }, { env, create: async () => ({}) });
  assert.equal(noName.error, "missing-name");
  const badCal = await addWalkin({ token: "sec", booking: { name: "A", calibration: "Nope" } }, { env, create: async () => ({}) });
  assert.equal(badCal.error, "bad-calibration");
});

test("the page renders the editable overdue rows and the walk-in form", () => {
  return review({ month: "2026-06", token: "sec" }, { env, now: NOW, listAll: async () => recs([completed(), overdue()]) })
    .then((r) => {
      const html = reviewPageHtml(r.subRows, r.openRows, r.month, env);
      assert.ok(html.includes('class="ob"'), "overdue rows are editable blocks");
      assert.ok(html.includes("ob-go"), "each overdue row has a Complete button");
      assert.ok(html.includes("Add a walk-in"), "walk-in section present");
      assert.ok(html.includes("wk-go"), "walk-in add button present");
      assert.ok(html.includes("OTT Calibration…"), "calibration picker present");
    });
});

test("an override flows through to the workbook download", async () => {
  const out = await review({ month: "2026-06", token: "sec", format: "xlsx" },
    { env, now: NOW, listAll: async () => recs([completed({ "Commission Override": 999 })]) });
  assert.ok(out.buffer.includes(Buffer.from("$999.00")), "overridden commission appears in the .xlsx ($ format)");
});
