const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildReport, dayStats } = require("../netlify/functions/sms-volume-report.js");

const ENV = { TWILIO_ACCOUNT_SID: "AC1", TWILIO_AUTH_TOKEN: "t", SLACK_WEBHOOK_URL: "https://hooks/x" };
const NOW = Date.parse("2026-07-28T13:00:00Z"); // report runs the morning after

const msg = (direction, segs, price) => ({ direction, num_segments: String(segs), price: price == null ? null : String(-price) });

test("dayStats: counts outbound msgs/segments/price and inbound, follows paging", async () => {
  const pages = [
    { messages: [msg("outbound-api", 2, 0.0158), msg("inbound", 1, null)], next_page_uri: "/2010-04-01/Accounts/AC1/Messages.json?Page=1&x=y" },
    { messages: [msg("outbound-reply", 1, 0.0079)], next_page_uri: null },
  ];
  let calls = 0;
  const fetchImpl = async () => ({ ok: true, status: 200, json: async () => pages[calls++] });
  const s = await dayStats("2026-07-27", { env: ENV, fetchImpl });
  assert.equal(calls, 2, "followed next_page_uri");
  assert.equal(s.out, 2);
  assert.equal(s.segs, 3);
  assert.equal(s.inbound, 1);
  assert.ok(Math.abs(s.price - 0.0237) < 1e-9);
});

test("buildReport: quiet day → plain line with 7-day average; no warning", async () => {
  // 7 trailing days at 10 out/day, yesterday 12 → no flag
  const perDay = { out: 10, segs: 20 };
  const fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({
    messages: Array.from({ length: 12 }, () => msg("outbound-api", 2, 0.0079)).concat([msg("inbound", 1, null)]),
    next_page_uri: null }) });
  const r = await buildReport({ env: ENV, fetchImpl, now: () => NOW });
  assert.match(r.text, /SMS volume 2026-07-27/);
  assert.match(r.text, /12 out/);
  assert.match(r.text, /1 in/);
  assert.ok(!r.text.includes("⚠"), r.text);
});

test("buildReport: yesterday > 2x trailing average → warning flag", async () => {
  let call = 0;
  const fetchImpl = async () => {
    call++;
    // first 7 calls = trailing days (5 out each), 8th = yesterday (40 out)
    const n = call <= 7 ? 5 : 40;
    return { ok: true, status: 200, json: async () => ({
      messages: Array.from({ length: n }, () => msg("outbound-api", 1, 0.0079)), next_page_uri: null }) };
  };
  const r = await buildReport({ env: ENV, fetchImpl, now: () => NOW });
  assert.ok(r.text.includes("⚠"), r.text);
  assert.match(r.text, /40 out/);
});

test("buildReport: missing Twilio env → skipped, no throw", async () => {
  const r = await buildReport({ env: { SLACK_WEBHOOK_URL: "x" }, fetchImpl: async () => { throw new Error("no fetch expected"); }, now: () => NOW });
  assert.equal(r.skipped, true);
});
