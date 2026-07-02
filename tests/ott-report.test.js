const { test } = require("node:test");
const assert = require("node:assert/strict");
const { priorMonth, monthFromKey, buildOttRows, renderOttCsv } = require("../netlify/functions/lib/ott-report.js");
const { runOttReport } = require("../netlify/functions/ott-report.js");
const { approveAndSend } = require("../netlify/functions/ott-report-send.js");

test("priorMonth reports the month before now (handles year rollover)", () => {
  assert.deepEqual(priorMonth(new Date("2026-07-01T13:00:00Z")), { key: "2026-06", label: "June 2026", year: 2026, month: 6 });
  assert.deepEqual(priorMonth(new Date("2026-01-01T13:00:00Z")), { key: "2025-12", label: "December 2025", year: 2025, month: 12 });
});

test("monthFromKey parses a YYYY-MM key and rejects bad input", () => {
  assert.deepEqual(monthFromKey("2026-06"), { key: "2026-06", label: "June 2026", year: 2026, month: 6 });
  assert.equal(monthFromKey("2026-13"), null);
  assert.equal(monthFromKey("nope"), null);
});

test("buildOttRows selects only completed calibrations in the target month", () => {
  const month = priorMonth(new Date("2026-07-01T13:00:00Z")); // June 2026
  const rows = buildOttRows([
    { id: "recABCDE12345", Name: "Jane", Vehicle: "Tundra", VIN: "5tfdw5f17mx000000", "OTT Calibration": "Spicy", "Calibration Date": "2026-06-15", Installer: ["cody"], Status: "Completed", City: "Omaha" },
    { id: "recX", Name: "Booked Only", "OTT Calibration": "Mild", "Calibration Date": "2026-06-10", Installer: "aaron", Status: "Booked" }, // not completed
    { id: "recY", Name: "No Cal", "OTT Calibration": "", "Calibration Date": "2026-06-10", Installer: "aaron", Status: "Completed" },   // no calibration
    { id: "recZ", Name: "Last Month", "OTT Calibration": "Light", "Calibration Date": "2026-05-28", Installer: "aaron", Status: "Completed" }, // wrong month
  ], month);
  assert.equal(rows.length, 1);
  const r = rows[0];
  assert.equal(r.name, "Jane");
  assert.equal(r.serial, "TY-2026-12345");        // certSerial from record id + calibration year
  assert.equal(r.vin, "5TFDW5F17MX000000");       // upper-cased
  assert.equal(r.calibration, "Spicy");
  assert.equal(r.installer, "Cody Star");          // resolved from the multi-select array
});

test("renderOttCsv emits a header + one row per calibration", () => {
  const csv = renderOttCsv([{ serial: "TY-2026-12345", calibrationDate: "2026-06-15", name: "Jane", vehicle: "Tundra", vin: "5TFDW5F17MX000000", calibration: "Spicy", installer: "Cody Star", region: "Sioux Falls, Rapid City & Omaha" }]);
  const lines = csv.trim().split("\n");
  assert.match(lines[0], /^Certificate Serial,Calibration Date,Customer,Vehicle,VIN,OTT Calibration,Installer,Region$/);
  assert.match(lines[1], /TY-2026-12345,2026-06-15,Jane,Tundra,5TFDW5F17MX000000,Spicy,Cody Star,/);
});

function deps(overrides = {}) {
  const notifies = [], sends = [];
  const bookings = [
    { id: "recABCDE12345", fields: { Name: "Jane", Vehicle: "Tundra", VIN: "5TFDW5F17MX000000", "OTT Calibration": "Spicy", "Calibration Date": "2026-06-15", Installer: ["cody"], Status: "Completed" } },
  ];
  return {
    env: { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b", SLACK_WEBHOOK_URL: "https://hooks.slack.test/x", RESEND_API_KEY: "re", OTT_APPROVE_SECRET: "s3cret", SITE_URL: "https://tunedyota.com" },
    now: new Date("2026-07-01T13:00:00Z"),
    listAll: async () => bookings,
    notify: async (a) => { notifies.push(a); return { ok: true }; },
    send: async (a) => { sends.push(a); return { id: "e" }; },
    log: { warn() {}, error() {} },
    _notifies: notifies, _sends: sends,
    ...overrides,
  };
}

// ---- DRAFT stage (rule #1: never sends to OTT) ----
test("runOttReport drafts to the OWNER only, with an approve link + CSV (never to OTT)", async () => {
  const d = deps();
  const out = await runOttReport(d);
  assert.equal(out.count, 1);
  assert.equal(out.drafted, true);
  assert.equal(d._sends.length, 1);
  assert.equal(d._sends[0].to, "info@tunedyota.com");        // owner, not OTT
  assert.equal(d._sends[0].cc, undefined);
  assert.match(d._sends[0].subject, /DRAFT — OTT Calibrations \(June 2026\) — review & approve/);
  assert.match(d._sends[0].html, /ott-report-send\?month=2026-06&amp;token=s3cret/); // private approve link (& escaped in href)
  assert.equal(d._sends[0].attachments[0].filename, "ott-calibrations-2026-06.csv");
  assert.match(d._notifies[0].text, /DRAFTED.*June 2026.*awaiting your approval/s);
});

test("runOttReport with no completed calibrations drafts nothing, just notifies", async () => {
  const d = deps({ listAll: async () => [] });
  const out = await runOttReport(d);
  assert.equal(out.count, 0);
  assert.equal(out.drafted, false);
  assert.equal(d._sends.length, 0);
  assert.match(d._notifies[0].text, /0 completed calibrations — nothing to approve/);
});

// ---- APPROVE & SEND stage (rule #2: to the two OTT contacts, CC owner) ----
test("approveAndSend rejects a bad/missing token (fail closed)", async () => {
  const d = deps();
  const bad = await approveAndSend({ month: "2026-06", token: "wrong" }, d);
  assert.equal(bad.status, "error");
  assert.equal(bad.code, 401);
  assert.equal(d._sends.length, 0);                          // nothing sent
});

test("approveAndSend emails both OTT contacts, CC owner, on a valid token", async () => {
  const d = deps();
  const out = await approveAndSend({ month: "2026-06", token: "s3cret" }, d);
  assert.equal(out.status, "sent");
  assert.equal(out.count, 1);
  assert.deepEqual(d._sends[0].to, ["info@overlandtailor.com", "hgobbels@me.com"]);
  assert.equal(d._sends[0].cc, "info@tunedyota.com");
  assert.match(d._sends[0].subject, /Completed OTT Calibrations \(June 2026\)/);
  assert.equal(d._sends[0].attachments[0].filename, "ott-calibrations-2026-06.csv");
  assert.match(d._notifies[0].text, /SENT.*June 2026.*info@overlandtailor\.com/s);
});

test("OTT_REPORT_TO overrides the OTT recipients", async () => {
  const d = deps({ env: { ...deps().env, OTT_REPORT_TO: "a@ott.test, b@ott.test" } });
  await approveAndSend({ month: "2026-06", token: "s3cret" }, d);
  assert.deepEqual(d._sends[0].to, ["a@ott.test", "b@ott.test"]);
});

test("approveAndSend reports empty when the month has no calibrations", async () => {
  const d = deps({ listAll: async () => [] });
  const out = await approveAndSend({ month: "2026-06", token: "s3cret" }, d);
  assert.equal(out.status, "empty");
  assert.equal(d._sends.length, 0);
});

test("approveAndSend surfaces a send failure without claiming success", async () => {
  const d = deps({ send: async () => { throw new Error("Resend 403"); } });
  const out = await approveAndSend({ month: "2026-06", token: "s3cret" }, d);
  assert.equal(out.status, "error");
  assert.equal(out.error, "send-failed");
});
