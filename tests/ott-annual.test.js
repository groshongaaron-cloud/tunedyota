const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildAnnual, renderAnnualXlsx } = require("../netlify/functions/lib/ott-annual.js");
const { runAnnual } = require("../netlify/functions/ott-annual.js");
const { runOnDemand } = require("../netlify/functions/ott-annual-run.js");

const booking = (extra = {}) => ({
  Name: "Jane", Vehicle: "2015 Toyota Tundra 5.7L V8", VIN: "5TFDW5F17MX000000", Status: "Completed",
  "OTT Calibration": "Spicy", "Tuning Platform": "PCM", "Calibration Type": "Basic",
  "ECU ID": "30CL0301", "Gear Size": "4.30", Mileage: 85000, Installer: ["cody"], ...extra,
});

test("buildAnnual aggregates a year's completed calibrations with cost totals", () => {
  const a = buildAnnual([
    { id: "r1", ...booking({ "Calibration Date": "2026-06-15" }) },
    { id: "r2", ...booking({ Name: "Sam", "Calibration Date": "2026-08-02", Installer: ["cody"] }) },
    { id: "r3", ...booking({ Name: "Old", "Calibration Date": "2025-12-30" }) }, // different year -> excluded
    { id: "r4", ...booking({ Name: "Nope", Status: "No-show", "Calibration Date": "2026-05-01" }) }, // not completed
  ], 2026);
  assert.equal(a.year, 2026);
  assert.equal(a.count, 2);
  assert.equal(a.totalCommission, 320);                 // 2 x $160 (Tundra 5.7 PCM Base)
  assert.equal(a.unresolvedCount, 0);
  assert.equal(a.byMonth[5].name, "June");              // index 5 = June
  assert.equal(a.byMonth[5].count, 1);
  assert.equal(a.byMonth[7].count, 1);                  // August
  assert.equal(a.byInstaller[0].name, "Cody Star");
  assert.equal(a.byInstaller[0].commission, 320);
  assert.equal(a.byVehicleType[0].name, "Tundra");
  assert.equal(a.detail.length, 2);
});

test("renderAnnualXlsx produces a real 2-sheet workbook (Summary + Detail)", () => {
  const a = buildAnnual([{ id: "r1", ...booking({ "Calibration Date": "2026-06-15" }) }], 2026);
  const buf = renderAnnualXlsx(a);
  assert.equal(buf[0], 0x50); assert.equal(buf[1], 0x4B);                 // PK
  assert.ok(buf.includes(Buffer.from("Annual Rollup")));
  assert.ok(buf.includes(Buffer.from("Summary")));
  assert.ok(buf.includes(Buffer.from("Detail")));
  assert.ok(buf.includes(Buffer.from("Cody Star")));
  assert.ok(buf.includes(Buffer.from("worksheets/sheet2.xml")));          // second sheet exists
});

function deps(overrides = {}) {
  const notifies = [], sends = [];
  return {
    env: { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b", SLACK_WEBHOOK_URL: "https://hooks.slack.test/x", RESEND_API_KEY: "re", OTT_APPROVE_SECRET: "s3cret" },
    listAll: async () => [{ id: "r1", fields: booking({ "Calibration Date": "2026-06-15" }) }, { id: "r2", fields: booking({ Name: "Sam", "Calibration Date": "2026-08-02" }) }],
    notify: async (a) => { notifies.push(a); return { ok: true }; },
    send: async (a) => { sends.push(a); return { id: "e" }; },
    log: { warn() {}, error() {} },
    _notifies: notifies, _sends: sends,
    ...overrides,
  };
}

test("runAnnual emails the private rollup to info@ only (never OTT) with the xlsx", async () => {
  const d = deps();
  const out = await runAnnual(2026, d);
  assert.equal(out.count, 2); assert.equal(out.total, 320);
  assert.equal(d._sends.length, 1);
  assert.equal(d._sends[0].to, "info@tunedyota.com");     // private — single recipient
  assert.equal(d._sends[0].cc, undefined);
  assert.match(d._sends[0].subject, /Annual Rollup \(2026\)/);
  assert.equal(d._sends[0].attachments[0].filename, "ott-annual-2026.xlsx");
  assert.equal(Buffer.from(d._sends[0].attachments[0].content, "base64")[0], 0x50);
  assert.match(d._notifies[0].text, /annual rollup.*2026.*private/s);
});

test("runAnnual reports zero cleanly for a year with no calibrations", async () => {
  const d = deps({ listAll: async () => [] });
  const out = await runAnnual(2030, d);
  assert.equal(out.count, 0);
  assert.equal(out.total, 0);
  assert.equal(d._sends[0].to, "info@tunedyota.com");
});

test("on-demand run is token-gated, then emails info@ for the requested year", async () => {
  const bad = await runOnDemand({ year: "2026", token: "nope" }, deps());
  assert.equal(bad.code, 401);
  assert.equal(deps()._sends.length, 0);
  const d = deps();
  const out = await runOnDemand({ year: "2026", token: "s3cret" }, d);
  assert.equal(out.status, "ok");
  assert.equal(out.count, 2);
  assert.equal(d._sends[0].to, "info@tunedyota.com");
  assert.equal(d._sends[0].attachments[0].filename, "ott-annual-2026.xlsx");
});
