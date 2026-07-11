const { test } = require("node:test");
const assert = require("node:assert/strict");
const { review, saveOverrides, reviewPageHtml, OVERRIDE_FIELD } = require("../netlify/functions/ott-report-review.js");

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

test("an override flows through to the workbook download", async () => {
  const out = await review({ month: "2026-06", token: "sec", format: "xlsx" },
    { env, now: NOW, listAll: async () => recs([completed({ "Commission Override": 999 })]) });
  assert.ok(out.buffer.includes(Buffer.from("999")), "overridden commission appears in the .xlsx");
});
