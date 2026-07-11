const { test } = require("node:test");
const assert = require("node:assert/strict");
const { review, reviewPageHtml } = require("../netlify/functions/ott-report-review.js");

const env = { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b", OTT_APPROVE_SECRET: "sec", SITE_URL: "https://tunedyota.com" };
const completed = (extra = {}) => ({
  id: "recABCDE12345", Name: "Jane", Vehicle: "2015 Toyota Tundra 5.7L V8", VIN: "5TFDW5F17MX000000",
  "OTT Calibration": "Spicy", "Calibration Date": "2026-06-15", Installer: ["cody"], Status: "Completed",
  "Tuning Platform": "PCM", "Calibration Type": "Basic", ...extra,
});
const recs = (rows) => rows.map((f) => ({ id: f.id || "rec1", fields: f }));

test("a bad/missing token is rejected (401)", async () => {
  const out = await review({ month: "2026-06", token: "nope" }, { env, listAll: async () => [] });
  assert.equal(out.code, 401);
  assert.equal(out.error, "unauthorized");
});

test("returns the month's rows for the page view", async () => {
  const out = await review({ month: "2026-06", token: "sec" },
    { env, listAll: async () => recs([completed()]) });
  assert.equal(out.status, "page");
  assert.equal(out.subRows.length, 1);
  assert.equal(out.month.key, "2026-06");
});

test("the review page shows the table, a download-Excel link and a Send-to-OTT link", () => {
  const out = { subRows: [] };
  // build rows through the real path for fidelity
  return review({ month: "2026-06", token: "sec" }, { env, listAll: async () => recs([completed()]) })
    .then((r) => {
      const html = reviewPageHtml(r.subRows, r.month, env);
      assert.match(html, /OTT Commission Review — June 2026/);
      assert.ok(html.includes("format=xlsx"), "has a Download Excel link");
      assert.ok(html.includes("ott-report-send?month=2026-06"), "has a Send to OTT link");
      assert.match(html, /Send to OTT/);
    });
});

test("format=xlsx returns the workbook as a Buffer", async () => {
  const out = await review({ month: "2026-06", token: "sec", format: "xlsx" },
    { env, listAll: async () => recs([completed()]) });
  assert.equal(out.status, "xlsx");
  assert.ok(Buffer.isBuffer(out.buffer));
  assert.ok(out.buffer.length > 0);
  // .xlsx is a zip — starts with "PK"
  assert.equal(out.buffer.slice(0, 2).toString(), "PK");
});

test("an empty month yields nothing to download or send", async () => {
  const page = await review({ month: "2026-06", token: "sec" },
    { env, listAll: async () => recs([completed({ Status: "Booked" })]) });
  assert.equal(page.status, "page");
  assert.equal(page.subRows.length, 0);
  const xlsx = await review({ month: "2026-06", token: "sec", format: "xlsx" },
    { env, listAll: async () => recs([completed({ Status: "Booked" })]) });
  assert.equal(xlsx.status, "empty");
});
