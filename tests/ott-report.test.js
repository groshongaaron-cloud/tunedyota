const { test } = require("node:test");
const assert = require("node:assert/strict");
const { priorMonth, monthFromKey, buildSubmissionRows, buildOpenBookings, renderOttXlsx, SUBMISSION_HEADERS } = require("../netlify/functions/lib/ott-report.js");
const { runOttReport } = require("../netlify/functions/ott-report.js");
const { approveAndSend } = require("../netlify/functions/ott-report-send.js");

const JUNE = priorMonth(new Date("2026-07-01T13:00:00Z")); // { key:"2026-06", label:"June 2026" }
const bookingFields = (extra = {}) => ({
  Name: "Jane", Vehicle: "2015 Toyota Tundra 5.7L V8", VIN: "5TFDW5F17MX000000",
  "OTT Calibration": "Spicy", "Calibration Date": "2026-06-15", Installer: ["cody"], Status: "Completed",
  "Tuning Platform": "PCM", "Calibration Type": "Basic", "ECU ID": "30cl0301", "Gear Size": "4.30", Mileage: 85000, ...extra,
});

test("priorMonth / monthFromKey", () => {
  assert.deepEqual(priorMonth(new Date("2026-01-01T13:00:00Z")), { key: "2025-12", label: "December 2025", year: 2025, month: 12 });
  assert.equal(monthFromKey("2026-13"), null);
  assert.deepEqual(monthFromKey("2026-06"), { key: "2026-06", label: "June 2026", year: 2026, month: 6 });
});

test("SUBMISSION_HEADERS are OTT's 14 columns in exact order", () => {
  assert.equal(SUBMISSION_HEADERS.length, 14);
  assert.equal(SUBMISSION_HEADERS[0], "Date of Submission");
  assert.equal(SUBMISSION_HEADERS[13], "Commission");
  assert.deepEqual(SUBMISSION_HEADERS.slice(5, 8), ["Vehicle Year", "Vehicle Type", "Engine Size"]);
});

test("buildSubmissionRows derives vehicle basics + resolves the commission", () => {
  const rows = buildSubmissionRows([{ id: "recABCDE12345", ...bookingFields() }], JUNE, { retailer: "Tuned Yota" });
  assert.equal(rows.length, 1);
  const r = rows[0];
  assert.equal(r.ottRetailer, "Tuned Yota - Cody");   // tagged per installer (bookingFields → cody)
  assert.equal(r.customer, "Jane");
  assert.equal(r.vin, "5TFDW5F17MX000000");
  assert.equal(r.vehicleYear, 2015);
  assert.equal(r.vehicleType, "Tundra");
  assert.equal(r.engineSize, "5.7");
  assert.equal(r.ecuId, "30CL0301");           // upper-cased
  assert.equal(r.gearSize, "4.30");
  assert.equal(r.mileage, 85000);
  assert.equal(r.tuningPlatform, "PCM");
  assert.equal(r.calibrationType, "Basic");
  assert.equal(r.commission, 160);             // Tundra 5.7 PCM Base = 160 (from the price sheet)
});

test("buildSubmissionRows leaves an unresolvable commission null (bench BB)", () => {
  const rows = buildSubmissionRows([{ id: "r1", ...bookingFields({ "Tuning Platform": "BB" }) }], JUNE, {});
  assert.equal(rows[0].commission, null);
});

test("Vehicle Year uses the captured Model Year, not the platform range start", () => {
  const rows = buildSubmissionRows([{ id: "r1", ...bookingFields({
    Vehicle: "2016-2023 Toyota Tacoma 3.5L V6", "Model Year": "2021" }) }], JUNE, {});
  assert.equal(rows[0].vehicleYear, 2021, "exact captured year wins over the 2016 range start");
});

test("Vehicle Year falls back to the derived range start when Model Year is blank", () => {
  const rows = buildSubmissionRows([{ id: "r1", ...bookingFields({
    Vehicle: "2016-2023 Toyota Tacoma 3.5L V6", "Model Year": "" }) }], JUNE, {});
  assert.equal(rows[0].vehicleYear, 2016, "legacy rows still get a year from the vehicle text");
});

test("a garbage Model Year is ignored in favor of the derived year", () => {
  const rows = buildSubmissionRows([{ id: "r1", ...bookingFields({
    Vehicle: "2016-2023 Toyota Tacoma 3.5L V6", "Model Year": "n/a" }) }], JUNE, {});
  assert.equal(rows[0].vehicleYear, 2016);
});

test("a manual Commission Override wins over the auto-resolved amount (incl. $0)", () => {
  const [r] = buildSubmissionRows([{ id: "r1", ...bookingFields({ "Commission Override": 275 }) }], JUNE, {});
  assert.equal(r.commission, 275);
  assert.equal(r._overridden, true);
  assert.equal(r._autoCommission, 160, "the auto amount is still tracked");
  const [z] = buildSubmissionRows([{ id: "r2", ...bookingFields({ "Commission Override": 0 }) }], JUNE, {});
  assert.equal(z.commission, 0, "a legitimate $0 override is honored, not treated as blank");
  assert.equal(z._overridden, true);
});

test("a blank/non-numeric Commission Override falls back to the lookup, and an override resolves an otherwise-unresolvable row", () => {
  const [blank] = buildSubmissionRows([{ id: "r1", ...bookingFields({ "Commission Override": "" }) }], JUNE, {});
  assert.equal(blank.commission, 160);
  assert.equal(blank._overridden, false);
  const [fixed] = buildSubmissionRows([{ id: "r2", ...bookingFields({ "Tuning Platform": "BB", "Commission Override": 190 }) }], JUNE, {});
  assert.equal(fixed.commission, 190, "override rescues a bench-BB row the lookup couldn't resolve");
  assert.equal(fixed._overridden, true);
});

test("buildOpenBookings lists only overdue, not-completed bookings (the chase list)", () => {
  const NOW = new Date("2026-07-10T12:00:00Z");
  const rows = buildOpenBookings([
    { id: "a", Name: "Overdue Olga", Vehicle: "2015 Tundra 5.7L V8 · More power", City: "Omaha", "Event Date": "2026-06-28", Status: "Booked", Installer: ["cody"] },
    { id: "b", Name: "Done Dan", "Event Date": "2026-06-28", Status: "Completed", Installer: ["cody"] },      // completed → excluded
    { id: "c", Name: "Future Fred", "Event Date": "2026-08-01", Status: "Booked", Installer: ["aaron"] },    // future → excluded
    { id: "d", Name: "Noshow Ned", "Event Date": "2026-06-28", Status: "No-show", Installer: ["cody"] },     // no-show → excluded
  ], NOW);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].customer, "Overdue Olga");
  assert.equal(rows[0].vehicle, "2015 Tundra 5.7L V8", "goals stripped from the vehicle line");
  assert.equal(rows[0].installerKey, "cody");
  assert.equal(rows[0].daysOverdue, 12);
});

test("renderOttXlsx produces a real .xlsx with the header row + data", () => {
  const rows = buildSubmissionRows([{ id: "recABCDE12345", ...bookingFields() }], JUNE, {});
  const buf = renderOttXlsx(rows);
  assert.equal(buf[0], 0x50); assert.equal(buf[1], 0x4B);              // "PK" zip magic
  assert.ok(buf.includes(Buffer.from("Date of Submission")));          // header present (STORE = searchable)
  assert.ok(buf.includes(Buffer.from("5TFDW5F17MX000000")));           // VIN present
  assert.ok(buf.includes(Buffer.from("Tundra")));
});

test("OTT Retailer (col C) is tagged per installer; falls back to plain name", () => {
  const [cody] = buildSubmissionRows([{ id: "r1", ...bookingFields({ Installer: ["cody"] }) }], JUNE, { retailer: "Tuned Yota" });
  assert.equal(cody.ottRetailer, "Tuned Yota - Cody");
  const [aaron] = buildSubmissionRows([{ id: "r2", ...bookingFields({ Installer: "aaron" }) }], JUNE, { retailer: "Tuned Yota" });
  assert.equal(aaron.ottRetailer, "Tuned Yota - Aaron");
  const [noah] = buildSubmissionRows([{ id: "r3", ...bookingFields({ Installer: ["noah"] }) }], JUNE, { retailer: "Tuned Yota" });
  assert.equal(noah.ottRetailer, "Tuned Yota - Noah");
  const [none] = buildSubmissionRows([{ id: "r4", ...bookingFields({ Installer: "" }) }], JUNE, { retailer: "Tuned Yota" });
  assert.equal(none.ottRetailer, "Tuned Yota", "no installer → plain retailer");
});

test("renderOttXlsx appends a GRAND TOTAL of the Commission column two rows below the last record", () => {
  const rows = buildSubmissionRows([
    { id: "r1", ...bookingFields({ Name: "A" }) },
    { id: "r2", ...bookingFields({ Name: "B", "Commission Override": 90 }) },
  ], JUNE, {});
  const buf = renderOttXlsx(rows);
  assert.ok(buf.includes(Buffer.from("GRAND TOTAL")), "label present");
  assert.ok(buf.includes(Buffer.from("250")), "grand total present (160 + 90)");
  assert.equal(rows.reduce((s, r) => s + (r.commission || 0), 0), 250);   // sanity
});

function deps(overrides = {}) {
  const notifies = [], sends = [];
  const bookings = [{ id: "recABCDE12345", fields: bookingFields() }];
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

test("runOttReport drafts the .xlsx to the OWNER with an approve link (never OTT)", async () => {
  const d = deps();
  const out = await runOttReport(d);
  assert.equal(out.count, 1); assert.equal(out.drafted, true); assert.equal(out.total, 160); assert.equal(out.unresolved, 0);
  assert.equal(d._sends[0].to, "info@tunedyota.com");
  assert.equal(d._sends[0].cc, undefined);
  assert.match(d._sends[0].subject, /DRAFT — OTT Commissions \(June 2026\)/);
  assert.equal(d._sends[0].attachments[0].filename, "ott-commissions-2026-06.xlsx");
  assert.equal(Buffer.from(d._sends[0].attachments[0].content, "base64")[0], 0x50); // real xlsx
  assert.match(d._sends[0].html, /ott-report-review\?month=2026-06&amp;token=s3cret/); // draft links to the online review, not straight to send
  assert.match(d._notifies[0].text, /DRAFTED.*June 2026.*awaiting your approval/s);
});

test("runOttReport flags rows needing a confirmed commission", async () => {
  const d = deps({ listAll: async () => [{ id: "r1", fields: bookingFields({ "Tuning Platform": "BB" }) }] });
  const out = await runOttReport(d);
  assert.equal(out.unresolved, 1);
  assert.equal(out.total, 0);
  assert.match(d._notifies[0].text, /need commission confirmed/);
});

test("approveAndSend emails both OTT contacts (CC owner) the .xlsx, stamped with the send date", async () => {
  const d = deps();
  const out = await approveAndSend({ month: "2026-06", token: "s3cret" }, d);
  assert.equal(out.status, "sent"); assert.equal(out.count, 1); assert.equal(out.total, 160);
  assert.deepEqual(d._sends[0].to, ["info@overlandtailor.com", "hgobbels@me.com"]);
  assert.equal(d._sends[0].cc, "info@tunedyota.com");
  assert.equal(d._sends[0].attachments[0].filename, "ott-commissions-2026-06.xlsx");
  const xbuf = Buffer.from(d._sends[0].attachments[0].content, "base64");
  assert.ok(xbuf.includes(Buffer.from("2026-07-01")));   // Date of Submission = the approval/send date
  assert.match(d._notifies[0].text, /SENT.*June 2026.*info@overlandtailor\.com/s);
});

test("approveAndSend fails closed on a bad token, and honors OTT_REPORT_TO", async () => {
  const bad = await approveAndSend({ month: "2026-06", token: "nope" }, deps());
  assert.equal(bad.code, 401);
  const d = deps({ env: { ...deps().env, OTT_REPORT_TO: "a@ott.test, b@ott.test" } });
  await approveAndSend({ month: "2026-06", token: "s3cret" }, d);
  assert.deepEqual(d._sends[0].to, ["a@ott.test", "b@ott.test"]);
});

test("approveAndSend reports empty months and surfaces send failures", async () => {
  const empty = await approveAndSend({ month: "2026-06", token: "s3cret" }, deps({ listAll: async () => [] }));
  assert.equal(empty.status, "empty");
  const failed = await approveAndSend({ month: "2026-06", token: "s3cret" }, deps({ send: async () => { throw new Error("Resend 403"); } }));
  assert.equal(failed.status, "error");
  assert.equal(failed.error, "send-failed");
});
